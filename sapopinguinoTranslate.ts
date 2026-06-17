import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { buildCorsResponseHeaders, isAllowedCorsRequest } from "./httpCors";
import { authenticatedHttpAction } from "./httpAuth";
import {
    STREAM_REGISTRATION_DELETION_ERROR,
    STREAM_REGISTRATION_MISSING_USER_ERROR,
    clearSapopinguinoStreamControl,
    consumeSapopinguinoStreamStopAction,
    maintainSapopinguinoStreamControlLease,
    monitorSapopinguinoStreamStopSignal,
    registerSapopinguinoStreamControl,
} from "./sapopinguino/streamControlRuntime";
import { sapopinguinoQuotaErrorResponse } from "./sapopinguinoHttp";
import {
    isValidSapopinguinoStreamId,
    readSapopinguinoJsonRequestBody,
    sanitizeSapopinguinoInputPayload,
} from "./sapopinguinoInput";
import {
    chargeSapopinguinoQuota,
    finalizeSapopinguinoQuota,
    reserveSapopinguinoQuota,
} from "./sapopinguinoQuota";
import type { Id } from "./subscriptions/_generated/dataModel";
import {
    streamOpenAIResponses,
    STREAM_END_MARKER,
    STREAM_ERROR_MARKER,
} from "./sapopinguino/openAiResponses";

type StreamRequestBody = {
    input?: string;
    streamId?: string;
};

function responseHeaders(
    request: Request,
    contentType = "text/event-stream; charset=utf-8",
    extraHeaders: Record<string, string> = {}
) {
    return buildCorsResponseHeaders(request, {
        contentType,
        cacheControl: "no-cache, no-transform",
        allowedMethods: "POST, OPTIONS",
        extraHeaders: {
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
            ...extraHeaders,
        },
    });
}

function formatSSEEvent(event: "token" | "done" | "error", data: string) {
    const lines = data.split("\n");
    const payload = [`event: ${event}`, ...lines.map((line) => `data: ${line}`), ""];
    return `${payload.join("\n")}\n`;
}

function enqueueEvent(
    controller: ReadableStreamDefaultController<Uint8Array>,
    encoder: TextEncoder,
    event: "token" | "done" | "error",
    data: string,
) {
    controller.enqueue(encoder.encode(formatSSEEvent(event, data)));
}

export const sapopinguinoTranslateOptions = httpAction(async (_ctx, request) => {
    if (!isAllowedCorsRequest(request)) {
        return new Response(null, {
            status: 403,
            headers: responseHeaders(request),
        });
    }

    return new Response(null, {
        status: 204,
        headers: responseHeaders(request),
    });
});

export const sapopinguinoTranslate = authenticatedHttpAction(async (ctx, request, auth) => {
    if (request.method !== "POST") {
        return new Response("Method not allowed", {
            status: 405,
            headers: responseHeaders(request, "text/event-stream; charset=utf-8", {
                Allow: "POST, OPTIONS",
            }),
        });
    }

    const bodyResult = await readSapopinguinoJsonRequestBody<StreamRequestBody>(request);
    if (!bodyResult.ok) {
        return new Response(formatSSEEvent("error", STREAM_ERROR_MARKER), {
            status: bodyResult.status,
            headers: responseHeaders(request),
        });
    }

    const body = bodyResult.body;

    if (typeof body.input !== "string" || body.input.length === 0) {
        return new Response(formatSSEEvent("error", STREAM_ERROR_MARKER), {
            status: 400,
            headers: responseHeaders(request),
        });
    }

    const sanitizedInput = sanitizeSapopinguinoInputPayload(body.input);

    if (!sanitizedInput) {
        return new Response(formatSSEEvent("error", STREAM_ERROR_MARKER), {
            status: 400,
            headers: responseHeaders(request),
        });
    }

    if (typeof body.streamId !== "string" || !isValidSapopinguinoStreamId(body.streamId)) {
        return new Response(formatSSEEvent("error", STREAM_ERROR_MARKER), {
            status: 400,
            headers: responseHeaders(request),
        });
    }

    const refreshResult = await ctx.runAction(
        internal.subscriptionsWorkers.refreshSubscriptionStateFromRevenueCat,
        {
            user_id: auth.userId,
        }
    );

    if (refreshResult.status === "refresh_failed" && refreshResult.should_block_requests) {
        return new Response(formatSSEEvent("error", STREAM_ERROR_MARKER), {
            status: 503,
            headers: responseHeaders(request),
        });
    }

    if (refreshResult.status === "deletion_in_progress") {
        return sapopinguinoQuotaErrorResponse(request, 409, "user_deletion_in_progress");
    }

    if (refreshResult.status === "user_missing") {
        return new Response(formatSSEEvent("error", STREAM_ERROR_MARKER), {
            status: 409,
            headers: responseHeaders(request),
        });
    }

    if (refreshResult.status === "pending_active" || refreshResult.status === "sync_in_progress") {
        return new Response(formatSSEEvent("error", STREAM_ERROR_MARKER), {
            status: 425,
            headers: responseHeaders(request),
        });
    }

    let usageEventId: Id<"usage_events"> | null = null;
    const operation = "translate" as const;

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
                request,
                quotaReservation.httpStatus,
                quotaReservation.reason
            );
        }

        if (quotaReservation.status === "error") {
            return new Response(formatSSEEvent("error", STREAM_ERROR_MARKER), {
                status: 500,
                headers: responseHeaders(request),
            });
        }

        usageEventId = quotaReservation.usageEventId;
    } catch {
        return new Response(formatSSEEvent("error", STREAM_ERROR_MARKER), {
            status: 500,
            headers: responseHeaders(request),
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
                logContext: "sapopinguino translate stream registration",
            });
        }

        if (isDeletionBlockedError) {
            return sapopinguinoQuotaErrorResponse(request, 409, "user_deletion_in_progress");
        }

        return new Response(formatSSEEvent("error", STREAM_ERROR_MARKER), {
            status: isMissingUserError ? 409 : 500,
            headers: responseHeaders(request),
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
                console.error(
                    "Failed to maintain sapopinguino translate stream control lease:",
                    error
                );
            });
            const stopMonitor = monitorSapopinguinoStreamStopSignal(ctx, {
                streamId,
                userId: auth.userId,
                operation,
                upstreamAbortController,
                onStopRequested: () => {
                    stopRequested = true;
                },
            }).catch((error) => {
                console.error(
                    "Failed to monitor sapopinguino translate stream stop state:",
                    error
                );
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
                    logContext: "sapopinguino translate stream",
                });
            };

            try {
                const streamResult = await streamOpenAIResponses({
                    input,
                    promptId: process.env.OPENAI_SAPOPINGUINO_TRANSLATE_PROMPT_ID,
                    promptVersion: process.env.OPENAI_SAPOPINGUINO_TRANSLATE_PROMPT_V,
                    signal: upstreamAbortController.signal,
                    onDelta: async (delta) => {
                        if (delta.length === 0) {
                            return "continue";
                        }

                        if (!(await ensureQuotaCharged())) {
                            enqueueEvent(controller, encoder, "error", STREAM_ERROR_MARKER);
                            return "errored";
                        }

                        enqueueEvent(controller, encoder, "token", delta);
                        return "continue";
                    },
                    onCompleted: () => {
                        enqueueEvent(controller, encoder, "done", STREAM_END_MARKER);
                    },
                    onErrored: () => {
                        enqueueEvent(controller, encoder, "error", STREAM_ERROR_MARKER);
                    },
                });

                if (streamResult === "completed") {
                    if (usageEventId) {
                        await finalizeSapopinguinoQuota(ctx, {
                            usageEventId,
                            terminalState: "completed",
                            logContext: "sapopinguino translate stream",
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
                        console.error(
                            "Failed to resolve sapopinguino translate abort state:",
                            resolutionError
                        );
                    }

                    await finalizeFailure(stopRequested || stopActionConsumed);
                } else {
                    enqueueEvent(controller, encoder, "error", STREAM_ERROR_MARKER);
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
                        console.error("Failed to clear sapopinguino translate stream control:", error);
                    }
                }

                controller.close();
            }
        },
    });

    return new Response(stream, {
        status: 200,
        headers: responseHeaders(request),
    });
}, responseHeaders);
