import type { ActionCtx } from "../../_generated/server";
import { buildCorsResponseHeaders } from "../http/cors";
import { handleCorsOptionsRequest } from "../http/responses";
import type { AuthenticatedHttpContext } from "../../lib/httpAuth";
import { prepareSapopinguinoRequest } from "./requestPreparation";
import { createSapopinguinoQuotaStream } from "./quotaStream";
import { streamCloudflareAI } from "./cloudflareAi";
import { tryEnqueueStreamOutput } from "./streamOutput";
import {
    KEEP_ALIVE_CONNECTION,
    POST_OPTIONS_METHODS,
    SAPOPINGUINO_STREAM_CACHE_CONTROL,
} from "../../constants/http";
import { SUBSCRIPTION_USAGE_OPERATIONS } from "../../constants/subscriptions";
import {
    SAPOPINGUINO_SSE_EVENTS,
    STREAM_END_MARKER,
    STREAM_ERROR_MARKER,
} from "../../constants/sapopinguino";

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
    return handleCorsOptionsRequest(request, responseHeaders);
}

export async function handleSapopinguinoTranslateRequest(
    ctx: ActionCtx,
    request: Request,
    auth: AuthenticatedHttpContext
) {
    const preparedRequest = await prepareSapopinguinoRequest(ctx, request, auth, {
        operation: SUBSCRIPTION_USAGE_OPERATIONS.TRANSLATE,
        error_body: formatSSEEvent(SAPOPINGUINO_SSE_EVENTS.ERROR, STREAM_ERROR_MARKER),
        method_not_allowed_content_type: "text/event-stream; charset=utf-8",
        get_response_headers: responseHeaders,
    });
    if (!preparedRequest.ok) {
        return preparedRequest.response;
    }

    const { input, usage_event_id: usageEventId } = preparedRequest;
    const encoder = new TextEncoder();

    const stream = createSapopinguinoQuotaStream(ctx, request, {
        usage_event_id: usageEventId,
        log_context: "sapopinguino translate stream",
        run: ({ controller, upstream, ensureQuotaCharged, hasChargedQuota }) =>
            streamCloudflareAI({
                    input,
                    operation: "translate",
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
                        if (hasChargedQuota()) {
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
            }),
        on_unexpected_error: (controller) => {
            enqueueEvent(
                controller,
                encoder,
                SAPOPINGUINO_SSE_EVENTS.ERROR,
                STREAM_ERROR_MARKER
            );
        },
    });

    return new Response(stream, {
        status: 200,
        headers: responseHeaders(request),
    });
}
