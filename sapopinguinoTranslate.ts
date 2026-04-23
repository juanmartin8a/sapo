import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { authenticatedOrAnonymousHttpAction } from "./httpAuth";
import {
    clearSapopinguinoStreamControl,
    consumeSapopinguinoStreamStopAction,
    isSapopinguinoUserDeletionInProgress,
    monitorSapopinguinoStreamStopSignal,
    registerSapopinguinoStreamControl,
} from "./sapopinguinoHttp";
import {
    chargeSapopinguinoQuota,
    completeSapopinguinoQuota,
    failSapopinguinoQuota,
    reserveSapopinguinoQuota,
    stopSapopinguinoQuota,
} from "./sapopinguinoQuota";
import type { Id } from "./subscriptions/_generated/dataModel";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const STREAM_END_MARKER = "<end:)>";
const STREAM_ERROR_MARKER = "<error:/>";

type StreamRequestBody = {
    input?: string;
    streamId?: string;
};

type OpenAIStreamEvent = {
    type?: string;
    delta?: string;
    error?: {
        message?: string;
    };
};

function responseHeaders() {
    return new Headers({
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": process.env.CLIENT_ORIGIN ?? "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        Vary: "Origin",
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

function sseEventsFromChunkBuffer(chunkBuffer: string): { events: string[]; remainder: string } {
    const normalized = chunkBuffer.replace(/\r\n/g, "\n");
    const events: string[] = [];

    let cursor = 0;
    let boundary = normalized.indexOf("\n\n", cursor);

    while (boundary !== -1) {
        events.push(normalized.slice(cursor, boundary));
        cursor = boundary + 2;
        boundary = normalized.indexOf("\n\n", cursor);
    }

    return {
        events,
        remainder: normalized.slice(cursor),
    };
}

function readSSEDataLines(rawEvent: string): string | null {
    const lines = rawEvent.split("\n");
    const dataLines: string[] = [];

    for (const line of lines) {
        if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
        }
    }

    if (dataLines.length === 0) {
        return null;
    }

    return dataLines.join("\n");
}

async function handleDataPayload(
    dataPayload: string,
    controller: ReadableStreamDefaultController<Uint8Array>,
    encoder: TextEncoder,
    ensureQuotaCharged: () => Promise<boolean>,
): Promise<"continue" | "completed" | "errored"> {
    if (dataPayload === "[DONE]") {
        enqueueEvent(controller, encoder, "done", STREAM_END_MARKER);
        return "completed";
    }

    let parsedEvent: OpenAIStreamEvent;
    try {
        parsedEvent = JSON.parse(dataPayload) as OpenAIStreamEvent;
    } catch {
        return "continue";
    }

    if (parsedEvent.type === "error" || parsedEvent.type?.endsWith(".error")) {
        enqueueEvent(controller, encoder, "error", STREAM_ERROR_MARKER);
        return "errored";
    }

    if (parsedEvent.type !== "response.output_text.delta" || typeof parsedEvent.delta !== "string") {
        return "continue";
    }

    if (!(await ensureQuotaCharged())) {
        enqueueEvent(controller, encoder, "error", STREAM_ERROR_MARKER);
        return "errored";
    }

    if (parsedEvent.delta.length === 0) {
        return "continue";
    }

    enqueueEvent(controller, encoder, "token", parsedEvent.delta);
    return "continue";
}

async function streamFromOpenAI(
    input: string,
    signal: AbortSignal,
    controller: ReadableStreamDefaultController<Uint8Array>,
    encoder: TextEncoder,
    ensureQuotaCharged: () => Promise<boolean>,
): Promise<"completed" | "errored"> {
    const openAIKey = process.env.OPENAI_API_KEY;
    const promptId = process.env.OPENAI_SAPOPINGUINO_TRANSLATE_PROMPT_ID;
    const promptVersion = process.env.OPENAI_SAPOPINGUINO_TRANSLATE_PROMPT_V;

    if (!openAIKey) {
        enqueueEvent(controller, encoder, "error", STREAM_ERROR_MARKER);
        return "errored";
    }

    const upstreamResponse = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${openAIKey}`,
            "Content-Type": "application/json",
            Accept: "text/event-stream",
        },
        body: JSON.stringify({
            prompt: {
                id: promptId,
                version: promptVersion,
            },
            input: input,
            stream: true,
        }),
        signal,
    });

    if (!upstreamResponse.ok || upstreamResponse.body === null) {
        enqueueEvent(controller, encoder, "error", STREAM_ERROR_MARKER);
        return "errored";
    }

    const reader = upstreamResponse.body.getReader();
    const textDecoder = new TextDecoder();
    let eventBuffer = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }

        eventBuffer += textDecoder.decode(value, { stream: true });
        const { events, remainder } = sseEventsFromChunkBuffer(eventBuffer);
        eventBuffer = remainder;

        for (const rawEvent of events) {
            const dataPayload = readSSEDataLines(rawEvent);
            if (dataPayload === null) {
                continue;
            }

            const nextStep = await handleDataPayload(
                dataPayload,
                controller,
                encoder,
                ensureQuotaCharged
            );
            if (nextStep !== "continue") {
                return nextStep;
            }
        }
    }

    if (eventBuffer.trim().length > 0) {
        const trailingPayload = readSSEDataLines(eventBuffer);
        if (trailingPayload !== null) {
            const nextStep = await handleDataPayload(
                trailingPayload,
                controller,
                encoder,
                ensureQuotaCharged
            );
            if (nextStep !== "continue") {
                return nextStep;
            }
        }
    }

    enqueueEvent(controller, encoder, "done", STREAM_END_MARKER);
    return "completed";
}

export const sapopinguinoTranslateOptions = httpAction(async () => {
    return new Response(null, {
        status: 204,
        headers: responseHeaders(),
    });
});

export const sapopinguinoTranslate = authenticatedOrAnonymousHttpAction(async (ctx, request, auth) => {
    if (request.method !== "POST") {
        return new Response("Method not allowed", {
            status: 405,
            headers: responseHeaders(),
        });
    }

    let body: StreamRequestBody;
    try {
        body = (await request.json()) as StreamRequestBody;
    } catch {
        return new Response(formatSSEEvent("error", STREAM_ERROR_MARKER), {
            status: 400,
            headers: responseHeaders(),
        });
    }

    if (typeof body.input !== "string" || body.input.length === 0) {
        return new Response(formatSSEEvent("error", STREAM_ERROR_MARKER), {
            status: 400,
            headers: responseHeaders(),
        });
    }

    if (typeof body.streamId !== "string" || body.streamId.length === 0) {
        return new Response(formatSSEEvent("error", STREAM_ERROR_MARKER), {
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
            return new Response(formatSSEEvent("error", STREAM_ERROR_MARKER), {
                status: 503,
                headers: responseHeaders(),
            });
        }

        if (
            refreshResult.status === "user_missing" ||
            refreshResult.status === "deletion_in_progress"
        ) {
            return new Response(formatSSEEvent("error", STREAM_ERROR_MARKER), {
                status: 409,
                headers: responseHeaders(),
            });
        }
    }

    let usageEventId: Id<"usage_events"> | null = null;
    const operation = "translate" as const;

    try {
        const quotaReservation = await reserveSapopinguinoQuota(ctx, {
            userId: auth.userId,
            operation,
            input: body.input,
            streamId: body.streamId,
            signupAtMs: auth.user.createdAt,
        });

        if (quotaReservation.status === "blocked") {
            return new Response(formatSSEEvent("error", STREAM_ERROR_MARKER), {
                status: quotaReservation.httpStatus,
                headers: responseHeaders(),
            });
        }

        if (quotaReservation.status === "error") {
            return new Response(formatSSEEvent("error", STREAM_ERROR_MARKER), {
                status: 500,
                headers: responseHeaders(),
            });
        }

        usageEventId = quotaReservation.usageEventId;
    } catch {
        return new Response(formatSSEEvent("error", STREAM_ERROR_MARKER), {
            status: 500,
            headers: responseHeaders(),
        });
    }

    try {
        if (!auth.isAnonymous && (await isSapopinguinoUserDeletionInProgress(ctx, auth.userId))) {
            if (usageEventId) {
                try {
                    await stopSapopinguinoQuota(ctx, usageEventId, false);
                } catch (error) {
                    console.error(
                        "Failed to stop sapopinguino translate quota during account deletion:",
                        error
                    );
                }
            }

            return new Response(formatSSEEvent("error", STREAM_ERROR_MARKER), {
                status: 409,
                headers: responseHeaders(),
            });
        }

        await registerSapopinguinoStreamControl(ctx, body.streamId, auth.userId, operation);
    } catch (error) {
        const isRegistrationBlockedError =
            error instanceof Error &&
            (error.message === "Cannot register sapopinguino stream while user deletion is in progress" ||
                error.message === "Cannot register sapopinguino stream for missing user");

        if (usageEventId) {
            try {
                if (isRegistrationBlockedError) {
                    await stopSapopinguinoQuota(ctx, usageEventId, false);
                } else {
                    await failSapopinguinoQuota(ctx, usageEventId, false);
                }
            } catch (error) {
                console.error("Failed to mark sapopinguino translate quota as failed before charge:", error);
            }
        }

        return new Response(formatSSEEvent("error", STREAM_ERROR_MARKER), {
            status: isRegistrationBlockedError ? 409 : 500,
            headers: responseHeaders(),
        });
    }

    const input = body.input;
    const streamId = body.streamId;
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
        start: async (controller) => {
            let stopActionConsumed = false;
            let stopRequested = false;
            let hasChargedQuota = false;
            const upstreamAbortController = new AbortController();
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
                      console.error(
                          "Failed to monitor sapopinguino translate stream stop state:",
                          error
                      );
                  });

            request.signal.addEventListener(
                "abort",
                () => {
                    if (!upstreamAbortController.signal.aborted) {
                        upstreamAbortController.abort();
                    }
                },
                { once: true }
            );

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

                try {
                    if (userStopped) {
                        await stopSapopinguinoQuota(ctx, usageEventId, hasChargedQuota);
                    } else {
                        await failSapopinguinoQuota(ctx, usageEventId, hasChargedQuota);
                    }
                } catch (error) {
                    console.error("Failed to finalize sapopinguino translate quota state:", error);
                }
            };

            try {
                const streamResult = await streamFromOpenAI(
                    input,
                    upstreamAbortController.signal,
                    controller,
                    encoder,
                    ensureQuotaCharged
                );

                if (streamResult === "completed") {
                    if (usageEventId) {
                        try {
                            await completeSapopinguinoQuota(ctx, usageEventId);
                        } catch (error) {
                            console.error("Failed to mark sapopinguino translate quota as completed:", error);
                        }
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
                if (!upstreamAbortController.signal.aborted) {
                    upstreamAbortController.abort();
                }

                await stopMonitor;

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
        headers: responseHeaders(),
    });
}, responseHeaders);
