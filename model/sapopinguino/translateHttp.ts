import type { ActionCtx } from "../../_generated/server";
import { buildCorsResponseHeaders, isAllowedCorsRequest } from "../http/cors";
import type { AuthenticatedHttpContext } from "../../lib/httpAuth";
import { sapopinguinoQuotaErrorResponse } from "./respellHttp";
import {
    isValidSapopinguinoStreamId,
    readSapopinguinoJsonRequestBody,
    sanitizeSapopinguinoInputPayload,
} from "./input";
import {
    chargeSapopinguinoQuota,
    finalizeSapopinguinoQuota,
    reserveSapopinguinoQuota,
} from "./quota";
import type { Id } from "../../subscriptions/_generated/dataModel";
import { streamOpenAIResponses } from "./openAiResponses";
import { createAbortableStream } from "./abortableStream";
import { closeStreamOutput, tryEnqueueStreamOutput } from "./streamOutput";
import { ABORT_ERROR_NAME } from "../../constants/errors";
import {
    KEEP_ALIVE_CONNECTION,
    POST_OPTIONS_METHODS,
    SAPOPINGUINO_STREAM_CACHE_CONTROL,
} from "../../constants/http";
import {
    SUBSCRIPTION_QUOTA_ERROR_CODES,
    SUBSCRIPTION_USAGE_OPERATIONS,
} from "../../constants/subscriptions";
import {
    SAPOPINGUINO_SSE_EVENTS,
    STREAM_END_MARKER,
    STREAM_ERROR_MARKER,
} from "../../constants/sapopinguino";
import { reconcileSubscriptionStateForUsage } from "../subscriptions/workers";

type StreamRequestBody = {
    input?: string;
    streamId?: string;
};

export function responseHeaders(
    request: Request,
    contentType = "text/event-stream; charset=utf-8",
    extraHeaders: Record<string, string> = {}
) {
    return buildCorsResponseHeaders(request, {
        contentType,
        cacheControl: SAPOPINGUINO_STREAM_CACHE_CONTROL,
        allowedMethods: POST_OPTIONS_METHODS,
        extraHeaders: {
            Connection: KEEP_ALIVE_CONNECTION,
            "X-Accel-Buffering": "no",
            ...extraHeaders,
        },
    });
}

type SapopinguinoSSEEvent =
    (typeof SAPOPINGUINO_SSE_EVENTS)[keyof typeof SAPOPINGUINO_SSE_EVENTS];

function formatSSEEvent(event: SapopinguinoSSEEvent, data: string) {
    const lines = data.split("\n");
    const payload = [`event: ${event}`, ...lines.map((line) => `data: ${line}`), ""];
    return `${payload.join("\n")}\n`;
}

function enqueueEvent(
    controller: ReadableStreamDefaultController<Uint8Array>,
    encoder: TextEncoder,
    event: SapopinguinoSSEEvent,
    data: string,
) {
    return tryEnqueueStreamOutput(controller, encoder, formatSSEEvent(event, data));
}

export async function handleSapopinguinoTranslateOptionsRequest(
    _ctx: ActionCtx,
    request: Request
) {
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
}

export async function handleSapopinguinoTranslateRequest(
    ctx: ActionCtx,
    request: Request,
    auth: AuthenticatedHttpContext
) {
    if (request.method !== "POST") {
        return new Response("Method not allowed", {
            status: 405,
            headers: responseHeaders(request, "text/event-stream; charset=utf-8", {
                Allow: POST_OPTIONS_METHODS,
            }),
        });
    }

    const bodyResult = await readSapopinguinoJsonRequestBody<StreamRequestBody>(request);
    if (!bodyResult.ok) {
        return new Response(formatSSEEvent(SAPOPINGUINO_SSE_EVENTS.ERROR, STREAM_ERROR_MARKER), {
            status: bodyResult.status,
            headers: responseHeaders(request),
        });
    }

    const body = bodyResult.body;

    if (typeof body.input !== "string" || body.input.length === 0) {
        return new Response(formatSSEEvent(SAPOPINGUINO_SSE_EVENTS.ERROR, STREAM_ERROR_MARKER), {
            status: 400,
            headers: responseHeaders(request),
        });
    }

    const sanitizedInput = sanitizeSapopinguinoInputPayload(body.input);

    if (!sanitizedInput) {
        return new Response(formatSSEEvent(SAPOPINGUINO_SSE_EVENTS.ERROR, STREAM_ERROR_MARKER), {
            status: 400,
            headers: responseHeaders(request),
        });
    }

    if (typeof body.streamId !== "string" || !isValidSapopinguinoStreamId(body.streamId)) {
        return new Response(formatSSEEvent(SAPOPINGUINO_SSE_EVENTS.ERROR, STREAM_ERROR_MARKER), {
            status: 400,
            headers: responseHeaders(request),
        });
    }

    const refreshResult = await reconcileSubscriptionStateForUsage(ctx, {
        user_id: auth.userId,
    });

    if (refreshResult.status === "refresh_failed" && refreshResult.should_block_requests) {
        return new Response(formatSSEEvent(SAPOPINGUINO_SSE_EVENTS.ERROR, STREAM_ERROR_MARKER), {
            status: 503,
            headers: responseHeaders(request),
        });
    }

    if (refreshResult.status === "deletion_in_progress") {
        return sapopinguinoQuotaErrorResponse(
            request,
            409,
            SUBSCRIPTION_QUOTA_ERROR_CODES.USER_DELETION_IN_PROGRESS
        );
    }

    if (refreshResult.status === "user_missing") {
        return new Response(formatSSEEvent(SAPOPINGUINO_SSE_EVENTS.ERROR, STREAM_ERROR_MARKER), {
            status: 409,
            headers: responseHeaders(request),
        });
    }

    if (refreshResult.status === "sync_in_progress") {
        return new Response(formatSSEEvent(SAPOPINGUINO_SSE_EVENTS.ERROR, STREAM_ERROR_MARKER), {
            status: 503,
            headers: responseHeaders(request, undefined, { "Retry-After": "1" }),
        });
    }

    let usageEventId: Id<"usage_events"> | null = null;
    const operation = SUBSCRIPTION_USAGE_OPERATIONS.TRANSLATE;

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
            return new Response(formatSSEEvent(SAPOPINGUINO_SSE_EVENTS.ERROR, STREAM_ERROR_MARKER), {
                status: 500,
                headers: responseHeaders(request),
            });
        }

        usageEventId = quotaReservation.usageEventId;
    } catch {
        return new Response(formatSSEEvent(SAPOPINGUINO_SSE_EVENTS.ERROR, STREAM_ERROR_MARKER), {
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
                    logContext: "sapopinguino translate stream",
                });
            };

            try {
                const streamResult = await streamOpenAIResponses({
                    input,
                    promptId: process.env.OPENAI_SAPOPINGUINO_TRANSLATE_PROMPT_ID,
                    promptVersion: process.env.OPENAI_SAPOPINGUINO_TRANSLATE_PROMPT_V,
                    signal: upstream.signal,
                    onDelta: async (delta) => {
                        if (delta.length === 0) {
                            return "continue";
                        }

                        if (!(await ensureQuotaCharged())) {
                            enqueueEvent(
                                controller,
                                encoder,
                                SAPOPINGUINO_SSE_EVENTS.ERROR,
                                STREAM_ERROR_MARKER
                            );
                            return "errored";
                        }

                        if (!enqueueEvent(controller, encoder, SAPOPINGUINO_SSE_EVENTS.TOKEN, delta)) {
                            upstream.abort();
                            return "errored";
                        }
                        return "continue";
                    },
                    onCompleted: () => {
                        if (hasChargedQuota) {
                            enqueueEvent(
                                controller,
                                encoder,
                                SAPOPINGUINO_SSE_EVENTS.DONE,
                                STREAM_END_MARKER
                            );
                        } else {
                            enqueueEvent(
                                controller,
                                encoder,
                                SAPOPINGUINO_SSE_EVENTS.ERROR,
                                STREAM_ERROR_MARKER
                            );
                        }
                    },
                    onErrored: () => {
                        enqueueEvent(
                            controller,
                            encoder,
                            SAPOPINGUINO_SSE_EVENTS.ERROR,
                            STREAM_ERROR_MARKER
                        );
                    },
                });

                if (streamResult === "completed") {
                    if (usageEventId) {
                        await finalizeSapopinguinoQuota(ctx, {
                            usageEventId,
                            outcome: hasChargedQuota ? "completed" : "failed",
                            logContext: "sapopinguino translate stream",
                        });
                    }
                } else {
                    await finalizeFailure();
                }
            } catch (error) {
                if ((error as Error).name === ABORT_ERROR_NAME) {
                    await finalizeFailure();
                } else {
                    await finalizeFailure();
                    enqueueEvent(
                        controller,
                        encoder,
                        SAPOPINGUINO_SSE_EVENTS.ERROR,
                        STREAM_ERROR_MARKER
                    );
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
