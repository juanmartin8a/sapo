import { internal } from "./_generated/api";
import { httpAction, type ActionCtx } from "./_generated/server";
import { buildCorsResponseHeaders, isAllowedCorsRequest } from "./httpCors";
import { authenticatedHttpAction, type AuthenticatedHttpContext } from "./httpAuth";
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
import { createAbortableStream } from "./sapopinguino/abortableStream";
import { closeStreamOutput, tryEnqueueStreamOutput } from "./sapopinguino/streamOutput";

type StreamRequestBody = {
    input?: string;
    streamId?: string;
};

type SapopinguinoQuotaErrorPayload = {
    error: string;
    message: string;
};

function responseHeaders(
    request: Request,
    contentType = "text/plain; charset=utf-8",
    extraHeaders: Record<string, string> = {}
) {
    return buildCorsResponseHeaders(request, {
        contentType,
        cacheControl: "no-cache, no-transform",
        allowedMethods: "POST, OPTIONS",
        extraHeaders: {
            Connection: "keep-alive",
            ...extraHeaders,
        },
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

export function sapopinguinoQuotaErrorResponse(request: Request, status: number, reason: string) {
    const payload: SapopinguinoQuotaErrorPayload = {
        error: reason,
        message: getQuotaErrorMessage(reason),
    };

    return new Response(JSON.stringify(payload), {
        status,
        headers: responseHeaders(request, "application/json; charset=utf-8"),
    });
}

function enqueueLine(controller: ReadableStreamDefaultController<Uint8Array>, encoder: TextEncoder, line: string) {
    return tryEnqueueStreamOutput(controller, encoder, `${line}\n`);
}

export const sapopinguinoOptions = httpAction(async (_ctx, request) => {
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

export async function handleSapopinguinoRequest(
    ctx: ActionCtx,
    request: Request,
    auth: AuthenticatedHttpContext
) {
    if (request.method !== "POST") {
        return new Response("Method not allowed", {
            status: 405,
            headers: responseHeaders(request, "text/plain; charset=utf-8", {
                Allow: "POST, OPTIONS",
            }),
        });
    }

    const bodyResult = await readSapopinguinoJsonRequestBody<StreamRequestBody>(request);
    if (!bodyResult.ok) {
        return new Response(STREAM_ERROR_MARKER, {
            status: bodyResult.status,
            headers: responseHeaders(request),
        });
    }

    const body = bodyResult.body;

    if (typeof body.input !== "string" || body.input.length === 0) {
        return new Response(STREAM_ERROR_MARKER, {
            status: 400,
            headers: responseHeaders(request),
        });
    }

    const sanitizedInput = sanitizeSapopinguinoInputPayload(body.input);

    if (!sanitizedInput) {
        return new Response(STREAM_ERROR_MARKER, {
            status: 400,
            headers: responseHeaders(request),
        });
    }

    if (typeof body.streamId !== "string" || !isValidSapopinguinoStreamId(body.streamId)) {
        return new Response(STREAM_ERROR_MARKER, {
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
        return new Response(STREAM_ERROR_MARKER, {
            status: 503,
            headers: responseHeaders(request),
        });
    }

    if (refreshResult.status === "deletion_in_progress") {
        return sapopinguinoQuotaErrorResponse(request, 409, "user_deletion_in_progress");
    }

    if (refreshResult.status === "user_missing") {
        return new Response(STREAM_ERROR_MARKER, {
            status: 409,
            headers: responseHeaders(request),
        });
    }

    if (refreshResult.status === "pending_active" || refreshResult.status === "sync_in_progress") {
        return new Response(STREAM_ERROR_MARKER, {
            status: 425,
            headers: responseHeaders(request),
        });
    }

    let usageEventId: Id<"usage_events"> | null = null;
    const operation = "respell" as const;

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
            return new Response(STREAM_ERROR_MARKER, {
                status: 500,
                headers: responseHeaders(request),
            });
        }

        usageEventId = quotaReservation.usageEventId;
    } catch {
        return new Response(STREAM_ERROR_MARKER, {
            status: 500,
            headers: responseHeaders(request),
        });
    }

    const input = sanitizedInput.payload;

    const encoder = new TextEncoder();
    const stream = createAbortableStream<Uint8Array>(async (controller, upstream) => {
            let hasChargedQuota = false;
            if (request.signal.aborted) {
                upstream.abort();
            } else {
                request.signal.addEventListener("abort", upstream.abort, { once: true });
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

            const finalizeFailure = async () => {
                if (!usageEventId) {
                    return;
                }

                await finalizeSapopinguinoQuota(ctx, {
                    usageEventId,
                    outcome: "failed",
                    logContext: "sapopinguino stream",
                });
            };

            try {
                const tokenParser = new TokenParser();
                const streamResult = await streamOpenAIResponses({
                    input,
                    promptId: process.env.OPENAI_SAPOPINGUINO_PROMPT_ID,
                    promptVersion: process.env.OPENAI_SAPOPINGUINO_PROMPT_V,
                    signal: upstream.signal,
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
                            if (!enqueueLine(controller, encoder, JSON.stringify(token))) {
                                upstream.abort();
                                return "errored";
                            }
                        }

                        return "continue";
                    },
                    onCompleted: () => {
                        enqueueLine(
                            controller,
                            encoder,
                            hasChargedQuota ? STREAM_END_MARKER : STREAM_ERROR_MARKER
                        );
                    },
                    onErrored: () => {
                        enqueueLine(controller, encoder, STREAM_ERROR_MARKER);
                    },
                });

                if (streamResult === "completed") {
                    if (usageEventId) {
                        await finalizeSapopinguinoQuota(ctx, {
                            usageEventId,
                            outcome: hasChargedQuota ? "completed" : "failed",
                            logContext: "sapopinguino stream",
                        });
                    }
                } else {
                    await finalizeFailure();
                }
            } catch (error) {
                if ((error as Error).name === "AbortError") {
                    await finalizeFailure();
                } else {
                    await finalizeFailure();
                    enqueueLine(controller, encoder, STREAM_ERROR_MARKER);
                }
            } finally {
                request.signal.removeEventListener("abort", upstream.abort);
                upstream.abort();
                closeStreamOutput(controller);
            }
        });

    return new Response(stream, {
        status: 200,
        headers: responseHeaders(request),
    });
}

export const sapopinguino = authenticatedHttpAction(handleSapopinguinoRequest, responseHeaders);
