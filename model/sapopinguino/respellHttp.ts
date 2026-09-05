import type { ActionCtx } from "../../_generated/server";
import { buildCorsResponseHeaders } from "../http/cors";
import { handleCorsOptionsRequest } from "../http/responses";
import type { AuthenticatedHttpContext } from "../../lib/httpAuth";
import { TokenParser } from "./tokenParser";
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
    STREAM_END_MARKER,
    STREAM_ERROR_MARKER,
} from "../../constants/sapopinguino";

export function responseHeaders(
    request: Request,
    contentType = "text/plain; charset=utf-8",
    extraHeaders: Record<string, string> = {}
) {
    return buildCorsResponseHeaders(request, {
        contentType,
        cacheControl: SAPOPINGUINO_STREAM_CACHE_CONTROL,
        allowedMethods: POST_OPTIONS_METHODS,
        extraHeaders: {
            Connection: KEEP_ALIVE_CONNECTION,
            ...extraHeaders,
        },
    });
}

function enqueueLine(controller: ReadableStreamDefaultController<Uint8Array>, encoder: TextEncoder, line: string) {
    return tryEnqueueStreamOutput(controller, encoder, `${line}\n`);
}

export async function handleSapopinguinoOptionsRequest(_ctx: ActionCtx, request: Request) {
    return handleCorsOptionsRequest(request, responseHeaders);
}

export async function handleSapopinguinoRequest(
    ctx: ActionCtx,
    request: Request,
    auth: AuthenticatedHttpContext
) {
    const preparedRequest = await prepareSapopinguinoRequest(ctx, request, auth, {
        operation: SUBSCRIPTION_USAGE_OPERATIONS.RESPELL,
        error_body: STREAM_ERROR_MARKER,
        method_not_allowed_content_type: "text/plain; charset=utf-8",
        get_response_headers: responseHeaders,
    });
    if (!preparedRequest.ok) {
        return preparedRequest.response;
    }

    const { input, usage_event_id: usageEventId } = preparedRequest;

    const encoder = new TextEncoder();
    const stream = createSapopinguinoQuotaStream(ctx, request, {
        usage_event_id: usageEventId,
        log_context: "sapopinguino stream",
        run: async ({ controller, upstream, ensureQuotaCharged, hasChargedQuota }) => {
            const tokenParser = new TokenParser();
            return streamCloudflareAI({
                    input,
                    operation: "respell",
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
                            hasChargedQuota() ? STREAM_END_MARKER : STREAM_ERROR_MARKER
                        );
                    },
                    onErrored: () => {
                        enqueueLine(controller, encoder, STREAM_ERROR_MARKER);
                    },
            });
        },
        on_unexpected_error: (controller) => {
            enqueueLine(controller, encoder, STREAM_ERROR_MARKER);
        },
    });

    return new Response(stream, {
        status: 200,
        headers: responseHeaders(request),
    });
}
