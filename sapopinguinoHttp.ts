import { components, internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { authenticatedOrAnonymousHttpAction } from "./httpAuth";
import {
    STREAM_REGISTRATION_DELETION_ERROR,
    STREAM_REGISTRATION_MISSING_USER_ERROR,
    clearSapopinguinoStreamControl,
    consumeSapopinguinoStreamStopAction,
    maintainSapopinguinoStreamControlLease,
    monitorSapopinguinoStreamStopSignal,
    registerSapopinguinoStreamControl,
    type SapopinguinoStreamOperation,
} from "./sapopinguino/streamControlRuntime";
import { TokenParser } from "./sapopinguino/tokenParser";
import type { Id } from "./subscriptions/_generated/dataModel";
import {
    chargeSapopinguinoQuota,
    finalizeSapopinguinoQuota,
    reserveSapopinguinoQuota,
} from "./sapopinguinoQuota";
import {
    isValidSapopinguinoStreamId,
    readSapopinguinoJsonRequestBody,
    sanitizeSapopinguinoInputPayload,
} from "./sapopinguinoInput";
import {
    streamOpenAIResponses,
    STREAM_END_MARKER,
    STREAM_ERROR_MARKER,
} from "./sapopinguino/openAiResponses";

type StreamRequestBody = {
    input?: string;
    streamId?: string;
};

type SapopinguinoQuotaErrorPayload = {
    error: string;
    message: string;
};

type StreamStopRequestBody = {
    streamId?: string;
    operation?: SapopinguinoStreamOperation;
};

export type { SapopinguinoStreamOperation } from "./sapopinguino/streamControlRuntime";

function isSapopinguinoStreamOperation(value: unknown): value is SapopinguinoStreamOperation {
    return value === "translate" || value === "respell";
}

function responseHeaders(contentType = "text/plain; charset=utf-8") {
    return new Headers({
        "Content-Type": contentType,
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": process.env.CLIENT_ORIGIN ?? "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        Vary: "Origin",
    });
}

function getQuotaErrorMessage(reason: string) {
    switch (reason) {
        case "monthly_limit_exceeded":
            return "Quota limit reached.";
        case "input_limit_exceeded":
            return "Input limit reached.";
        case "user_deletion_in_progress":
            return "Account deletion is in progress.";
        default:
            return "Unable to start this request.";
    }
}

export function sapopinguinoQuotaErrorResponse(status: number, reason: string) {
    const payload: SapopinguinoQuotaErrorPayload = {
        error: reason,
        message: getQuotaErrorMessage(reason),
    };

    return new Response(JSON.stringify(payload), {
        status,
        headers: responseHeaders("application/json; charset=utf-8"),
    });
}

function enqueueLine(controller: ReadableStreamDefaultController<Uint8Array>, encoder: TextEncoder, line: string) {
    controller.enqueue(encoder.encode(`${line}\n`));
}

export const sapopinguinoOptions = httpAction(async () => {
    return new Response(null, {
        status: 204,
        headers: responseHeaders(),
    });
});

export const sapopinguinoStopOptions = httpAction(async () => {
    return new Response(null, {
        status: 204,
        headers: responseHeaders("application/json; charset=utf-8"),
    });
});

export const sapopinguino = authenticatedOrAnonymousHttpAction(async (ctx, request, auth) => {
    if (request.method !== "POST") {
        return new Response("Method not allowed", {
            status: 405,
            headers: responseHeaders(),
        });
    }

    const bodyResult = await readSapopinguinoJsonRequestBody<StreamRequestBody>(request);
    if (!bodyResult.ok) {
        return new Response(STREAM_ERROR_MARKER, {
            status: bodyResult.status,
            headers: responseHeaders(),
        });
    }

    const body = bodyResult.body;

    if (typeof body.input !== "string" || body.input.length === 0) {
        return new Response(STREAM_ERROR_MARKER, {
            status: 400,
            headers: responseHeaders(),
        });
    }

    const sanitizedInput = sanitizeSapopinguinoInputPayload(body.input);

    if (!sanitizedInput) {
        return new Response(STREAM_ERROR_MARKER, {
            status: 400,
            headers: responseHeaders(),
        });
    }

    if (typeof body.streamId !== "string" || !isValidSapopinguinoStreamId(body.streamId)) {
        return new Response(STREAM_ERROR_MARKER, {
            status: 400,
            headers: responseHeaders(),
        });
    }

    if (!auth.isAnonymous) {
        const refreshResult = await ctx.runAction(
            internal.subscriptionsWorkers.refreshSubscriptionStateFromRevenueCat,
            {
                user_id: auth.userId,
            }
        );

        if (refreshResult.status === "refresh_failed" && refreshResult.should_block_requests) {
            return new Response(STREAM_ERROR_MARKER, {
                status: 503,
                headers: responseHeaders(),
            });
        }

        if (refreshResult.status === "deletion_in_progress") {
            return sapopinguinoQuotaErrorResponse(409, "user_deletion_in_progress");
        }

        if (refreshResult.status === "user_missing") {
            return new Response(STREAM_ERROR_MARKER, {
                status: 409,
                headers: responseHeaders(),
            });
        }
    }

    let usageEventId: Id<"usage_events"> | null = null;
    const operation: SapopinguinoStreamOperation = "respell";

    try {
        const quotaReservation = await reserveSapopinguinoQuota(ctx, {
            userId: auth.userId,
            operation,
            input: sanitizedInput.userInput,
            streamId: body.streamId,
            signupAtMs: auth.user.createdAt,
        });

        if (quotaReservation.status === "blocked") {
            return sapopinguinoQuotaErrorResponse(
                quotaReservation.httpStatus,
                quotaReservation.reason
            );
        }

        if (quotaReservation.status === "error") {
            return new Response(STREAM_ERROR_MARKER, {
                status: 500,
                headers: responseHeaders(),
            });
        }

        usageEventId = quotaReservation.usageEventId;
    } catch {
        return new Response(STREAM_ERROR_MARKER, {
            status: 500,
            headers: responseHeaders(),
        });
    }

    try {
        await registerSapopinguinoStreamControl(ctx, body.streamId, auth.userId, operation);
    } catch (error) {
        const isDeletionBlockedError =
            error instanceof Error &&
            error.message === STREAM_REGISTRATION_DELETION_ERROR;
        const isMissingUserError =
            error instanceof Error &&
            error.message === STREAM_REGISTRATION_MISSING_USER_ERROR;

        if (usageEventId) {
            await finalizeSapopinguinoQuota(ctx, {
                usageEventId,
                terminalState:
                    isDeletionBlockedError || isMissingUserError
                        ? "user_stopped_before_charge"
                        : "failed_before_charge",
                logContext: "sapopinguino stream registration",
            });
        }

        if (isDeletionBlockedError) {
            return sapopinguinoQuotaErrorResponse(409, "user_deletion_in_progress");
        }

        return new Response(STREAM_ERROR_MARKER, {
            status: isMissingUserError ? 409 : 500,
            headers: responseHeaders(),
        });
    }

    const input = sanitizedInput.payload;
    const streamId = body.streamId;

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        start: async (controller) => {
            let stopActionConsumed = false;
            let stopRequested = false;
            let hasChargedQuota = false;
            const upstreamAbortController = new AbortController();
            const abortUpstream = () => {
                if (!upstreamAbortController.signal.aborted) {
                    upstreamAbortController.abort();
                }
            };
            const streamControlLeaseMonitor = maintainSapopinguinoStreamControlLease(ctx, {
                streamId,
                userId: auth.userId,
                operation,
                upstreamAbortController,
                onStopRequested: () => {
                    stopRequested = true;
                },
            }).catch((error) => {
                console.error("Failed to maintain sapopinguino stream control lease:", error);
            });
            const stopMonitor = auth.isAnonymous
                ? null
                : monitorSapopinguinoStreamStopSignal(ctx, {
                      streamId,
                      userId: auth.userId,
                      operation,
                      upstreamAbortController,
                      onStopRequested: () => {
                          stopRequested = true;
                      },
                  }).catch((error) => {
                      console.error("Failed to monitor sapopinguino stream stop state:", error);
                  });

            if (request.signal.aborted) {
                abortUpstream();
            } else {
                request.signal.addEventListener("abort", abortUpstream, { once: true });
            }

            const ensureQuotaCharged = async () => {
                if (!usageEventId) {
                    return false;
                }

                if (hasChargedQuota) {
                    return true;
                }

                const charged = await chargeSapopinguinoQuota(ctx, usageEventId);
                if (charged) {
                    hasChargedQuota = true;
                }

                return charged;
            };

            const finalizeFailure = async (userStopped: boolean) => {
                if (!usageEventId) {
                    return;
                }

                await finalizeSapopinguinoQuota(ctx, {
                    usageEventId,
                    terminalState: userStopped
                        ? hasChargedQuota
                            ? "user_stopped_after_charge"
                            : "user_stopped_before_charge"
                        : hasChargedQuota
                          ? "failed_after_charge"
                          : "failed_before_charge",
                    logContext: "sapopinguino stream",
                });
            };

            try {
                const tokenParser = new TokenParser();
                const streamResult = await streamOpenAIResponses({
                    input,
                    promptId: process.env.OPENAI_SAPOPINGUINO_PROMPT_ID,
                    promptVersion: process.env.OPENAI_SAPOPINGUINO_PROMPT_V,
                    signal: upstreamAbortController.signal,
                    onDelta: async (delta) => {
                        const parsedTokens = tokenParser.consume(delta);
                        if (parsedTokens.length === 0) {
                            return "continue";
                        }

                        if (!(await ensureQuotaCharged())) {
                            enqueueLine(controller, encoder, STREAM_ERROR_MARKER);
                            return "errored";
                        }

                        for (const token of parsedTokens) {
                            enqueueLine(controller, encoder, JSON.stringify(token));
                        }

                        return "continue";
                    },
                    onCompleted: () => {
                        enqueueLine(controller, encoder, STREAM_END_MARKER);
                    },
                    onErrored: () => {
                        enqueueLine(controller, encoder, STREAM_ERROR_MARKER);
                    },
                });

                if (streamResult === "completed") {
                    if (usageEventId) {
                        await finalizeSapopinguinoQuota(ctx, {
                            usageEventId,
                            terminalState: "completed",
                            logContext: "sapopinguino stream",
                        });
                    }
                } else {
                    await finalizeFailure(false);
                }
            } catch (error) {
                if ((error as Error).name === "AbortError") {
                    try {
                        stopActionConsumed = await consumeSapopinguinoStreamStopAction(
                            ctx,
                            streamId,
                            auth.userId,
                            operation
                        );
                    } catch (resolutionError) {
                        console.error("Failed to resolve sapopinguino abort state:", resolutionError);
                    }

                    await finalizeFailure(stopRequested || stopActionConsumed);
                } else {
                    enqueueLine(controller, encoder, STREAM_ERROR_MARKER);
                    await finalizeFailure(false);
                }
            } finally {
                request.signal.removeEventListener("abort", abortUpstream);

                if (!upstreamAbortController.signal.aborted) {
                    upstreamAbortController.abort();
                }

                await stopMonitor;
                await streamControlLeaseMonitor;

                if (!stopActionConsumed) {
                    try {
                        await clearSapopinguinoStreamControl(ctx, streamId, auth.userId, operation);
                    } catch (error) {
                        console.error("Failed to clear sapopinguino stream control:", error);
                    }
                }

                controller.close();
            }
        },
    });

    return new Response(stream, {
        status: 200,
        headers: responseHeaders(),
    });
}, responseHeaders);

export const sapopinguinoStop = authenticatedOrAnonymousHttpAction(async (ctx, request, auth) => {
    if (request.method !== "POST") {
        return new Response(JSON.stringify({ ok: false }), {
            status: 405,
            headers: responseHeaders("application/json; charset=utf-8"),
        });
    }

    const bodyResult = await readSapopinguinoJsonRequestBody<StreamStopRequestBody>(request);
    if (!bodyResult.ok) {
        return new Response(JSON.stringify({ ok: false }), {
            status: bodyResult.status,
            headers: responseHeaders("application/json; charset=utf-8"),
        });
    }

    const body = bodyResult.body;

    if (typeof body.streamId !== "string" || !isValidSapopinguinoStreamId(body.streamId)) {
        return new Response(JSON.stringify({ ok: false }), {
            status: 400,
            headers: responseHeaders("application/json; charset=utf-8"),
        });
    }

    if (!isSapopinguinoStreamOperation(body.operation)) {
        return new Response(JSON.stringify({ ok: false }), {
            status: 400,
            headers: responseHeaders("application/json; charset=utf-8"),
        });
    }

    try {
        const result = await ctx.runMutation(components.sapopinguino.streamControl.requestStreamStop, {
            streamId: body.streamId,
            userId: auth.userId,
            operation: body.operation,
            nowMs: Date.now(),
        });

        if (!result.accepted) {
            return new Response(JSON.stringify({ ok: false }), {
                status: 409,
                headers: responseHeaders("application/json; charset=utf-8"),
            });
        }
    } catch (error) {
        console.error("Failed to request sapopinguino stop:", error);
        return new Response(JSON.stringify({ ok: false }), {
            status: 500,
            headers: responseHeaders("application/json; charset=utf-8"),
        });
    }

    return new Response(JSON.stringify({ ok: true }), {
        status: 202,
        headers: responseHeaders("application/json; charset=utf-8"),
    });
}, () => responseHeaders("application/json; charset=utf-8"));
