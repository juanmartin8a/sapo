import { components, internal } from "./_generated/api";
import {
    type ActionCtx,
    httpAction,
} from "./_generated/server";
import { authenticatedOrAnonymousHttpAction } from "./httpAuth";
import type { Id } from "./subscriptions/_generated/dataModel";
import {
    chargeSapopinguinoQuota,
    completeSapopinguinoQuota,
    failSapopinguinoQuota,
    reserveSapopinguinoQuota,
    stopSapopinguinoQuota,
} from "./sapopinguinoQuota";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const STREAM_END_MARKER = "<end:)>";
const STREAM_ERROR_MARKER = "<error:/>";
const STOP_RECONCILIATION_ATTEMPTS = 8;
const STOP_RECONCILIATION_DELAY_MS = 75;
const STREAM_STOP_POLL_INTERVAL_MS = 250;

type StreamRequestBody = {
    input?: string;
    streamId?: string;
};

type StreamStopRequestBody = {
    streamId?: string;
    operation?: SapopinguinoStreamOperation;
};

export type SapopinguinoStreamOperation = "translate" | "respell";
export type SapopinguinoAbortResolution = "stopped" | "aborted";

function isSapopinguinoStreamOperation(value: unknown): value is SapopinguinoStreamOperation {
    return value === "translate" || value === "respell";
}

type OpenAIStreamEvent = {
    type?: string;
    delta?: string;
    error?: {
        message?: string;
    };
};

type Token =
    | {
        type: string;
        input: string;
        transcription: string;
        output: string;
    }
    | {
        type: string;
        value: string;
    };

class TokenParser {
    private hasEnteredTokensArray = false;
    private collectingToken = false;
    private currentToken = "";
    private bracketDepth = 0;
    private inString = false;
    private isEscaping = false;

    consume(delta: string): Token[] {
        const parsedTokens: Token[] = [];

        for (const character of delta) {
            if (!this.hasEnteredTokensArray) {
                if (character === "[") {
                    this.hasEnteredTokensArray = true;
                }
                continue;
            }

            if (!this.collectingToken) {
                if (character === "[") {
                    this.collectingToken = true;
                    this.currentToken = "[";
                    this.bracketDepth = 1;
                    this.inString = false;
                    this.isEscaping = false;
                }
                continue;
            }

            this.currentToken += character;

            if (this.inString) {
                if (this.isEscaping) {
                    this.isEscaping = false;
                    continue;
                }

                if (character === "\\") {
                    this.isEscaping = true;
                    continue;
                }

                if (character === '"') {
                    this.inString = false;
                }
                continue;
            }

            if (character === '"') {
                this.inString = true;
                continue;
            }

            if (character === "[") {
                this.bracketDepth += 1;
                continue;
            }

            if (character === "]") {
                this.bracketDepth -= 1;
                if (this.bracketDepth === 0) {
                    const token = this.parseToken(this.currentToken);
                    if (token !== null) {
                        parsedTokens.push(token);
                    }

                    this.collectingToken = false;
                    this.currentToken = "";
                }
            }
        }

        return parsedTokens;
    }

    private parseToken(tokenText: string): Token | null {
        let tokenSlice: unknown;
        try {
            tokenSlice = JSON.parse(tokenText);
        } catch {
            return null;
        }

        if (!Array.isArray(tokenSlice) || tokenSlice.length < 2) {
            return null;
        }

        const tokenType = typeof tokenSlice[0] === "string" ? tokenSlice[0] : null;
        if (tokenType === null) {
            return null;
        }

        if (tokenType === "word" && tokenSlice.length >= 4) {
            const input = typeof tokenSlice[1] === "string" ? tokenSlice[1] : "";
            const transcription = typeof tokenSlice[2] === "string" ? tokenSlice[2] : "";
            const output = typeof tokenSlice[3] === "string" ? tokenSlice[3] : "";

            return {
                type: tokenType,
                input,
                transcription,
                output,
            };
        }

        const value = typeof tokenSlice[1] === "string" ? tokenSlice[1] : "";
        return {
            type: tokenType,
            value,
        };
    }
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

function enqueueLine(controller: ReadableStreamDefaultController<Uint8Array>, encoder: TextEncoder, line: string) {
    controller.enqueue(encoder.encode(`${line}\n`));
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

function sleep(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function registerSapopinguinoStreamControl(
    ctx: ActionCtx,
    streamId: string,
    userId: string,
    operation: SapopinguinoStreamOperation,
) {
    await ctx.runMutation(components.sapopinguino.streamControl.registerStreamControl, {
        streamId,
        userId,
        operation,
        nowMs: Date.now(),
    });
}

export async function resolveAbortedSapopinguinoStream(
    ctx: ActionCtx,
    streamId: string,
    userId: string,
    operation: SapopinguinoStreamOperation,
): Promise<SapopinguinoAbortResolution> {
    for (let attempt = 0; attempt < STOP_RECONCILIATION_ATTEMPTS; attempt += 1) {
        const result = await ctx.runMutation(components.sapopinguino.streamControl.consumeStreamControlAction, {
            streamId,
            userId,
            operation,
        });

        if (result.action === "stop") {
            return "stopped";
        }

        if (attempt < STOP_RECONCILIATION_ATTEMPTS - 1) {
            await sleep(STOP_RECONCILIATION_DELAY_MS);
        }
    }

    return "aborted";
}

export async function clearSapopinguinoStreamControl(
    ctx: ActionCtx,
    streamId: string,
    userId: string,
    operation: SapopinguinoStreamOperation,
) {
    await ctx.runMutation(components.sapopinguino.streamControl.clearStreamControl, {
        streamId,
        userId,
        operation,
    });
}

export async function consumeSapopinguinoStreamStopAction(
    ctx: ActionCtx,
    streamId: string,
    userId: string,
    operation: SapopinguinoStreamOperation,
) {
    const result = await ctx.runMutation(components.sapopinguino.streamControl.consumeStreamControlAction, {
        streamId,
        userId,
        operation,
    });

    return result.action === "stop";
}

export async function isSapopinguinoUserDeletionInProgress(
    ctx: ActionCtx,
    userId: string,
) {
    const result = await (ctx as any).runQuery(
        (components.subscriptions.webhook as Record<string, unknown>).getUserDeletionOperationState,
        {
            user_id: userId,
        }
    );

    return (result as { in_progress: boolean }).in_progress === true;
}

export async function monitorSapopinguinoStreamStopSignal(
    ctx: ActionCtx,
    args: {
        streamId: string;
        userId: string;
        operation: SapopinguinoStreamOperation;
        upstreamAbortController: AbortController;
        onStopRequested: () => void;
    },
) {
    let hasLoggedQueryFailure = false;

    while (!args.upstreamAbortController.signal.aborted) {
        try {
            const [streamControlStatus, deletionInProgress] = await Promise.all([
                (ctx as any).runQuery(
                    (components.sapopinguino.streamControl as Record<string, unknown>)
                        .getStreamControlStatus,
                    {
                        streamId: args.streamId,
                        userId: args.userId,
                        operation: args.operation,
                    }
                ) as Promise<{ action: "stop" | null }>,
                isSapopinguinoUserDeletionInProgress(ctx, args.userId),
            ]);

            hasLoggedQueryFailure = false;

            if (streamControlStatus.action === "stop" || deletionInProgress) {
                args.onStopRequested();

                if (!args.upstreamAbortController.signal.aborted) {
                    args.upstreamAbortController.abort();
                }

                return;
            }
        } catch (error) {
            if (!hasLoggedQueryFailure) {
                console.error("Failed to poll sapopinguino stream stop state:", error);
                hasLoggedQueryFailure = true;
            }
        }

        await sleep(STREAM_STOP_POLL_INTERVAL_MS);
    }
}

async function handleDataPayload(
    dataPayload: string,
    tokenParser: TokenParser,
    controller: ReadableStreamDefaultController<Uint8Array>,
    encoder: TextEncoder,
    ensureQuotaCharged: () => Promise<boolean>,
): Promise<"continue" | "completed" | "errored"> {
    if (dataPayload === "[DONE]") {
        enqueueLine(controller, encoder, STREAM_END_MARKER);
        return "completed";
    }

    let parsedEvent: OpenAIStreamEvent;
    try {
        parsedEvent = JSON.parse(dataPayload) as OpenAIStreamEvent;
    } catch {
        return "continue";
    }

    if (parsedEvent.type === "error" || parsedEvent.type?.endsWith(".error")) {
        enqueueLine(controller, encoder, STREAM_ERROR_MARKER);
        return "errored";
    }

    if (parsedEvent.type !== "response.output_text.delta" || typeof parsedEvent.delta !== "string") {
        return "continue";
    }

    if (!(await ensureQuotaCharged())) {
        enqueueLine(controller, encoder, STREAM_ERROR_MARKER);
        return "errored";
    }

    const parsedTokens = tokenParser.consume(parsedEvent.delta);
    for (const token of parsedTokens) {
        enqueueLine(controller, encoder, JSON.stringify(token));
    }

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
    const promptId = process.env.OPENAI_SAPOPINGUINO_PROMPT_ID;
    const promptVersion = process.env.OPENAI_SAPOPINGUINO_PROMPT_V;

    if (!openAIKey) {
        enqueueLine(controller, encoder, STREAM_ERROR_MARKER);
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
        enqueueLine(controller, encoder, STREAM_ERROR_MARKER);
        return "errored";
    }

    const reader = upstreamResponse.body.getReader();
    const textDecoder = new TextDecoder();
    const tokenParser = new TokenParser();
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
                tokenParser,
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
                tokenParser,
                controller,
                encoder,
                ensureQuotaCharged
            );
            if (nextStep !== "continue") {
                return nextStep;
            }
        }
    }

    enqueueLine(controller, encoder, STREAM_END_MARKER);
    return "completed";
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

    let body: StreamRequestBody;
    try {
        body = (await request.json()) as StreamRequestBody;
    } catch {
        return new Response(STREAM_ERROR_MARKER, {
            status: 400,
            headers: responseHeaders(),
        });
    }

    if (typeof body.input !== "string" || body.input.length === 0) {
        return new Response(STREAM_ERROR_MARKER, {
            status: 400,
            headers: responseHeaders(),
        });
    }

    if (typeof body.streamId !== "string" || body.streamId.length === 0) {
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

        if (
            refreshResult.status === "user_missing" ||
            refreshResult.status === "deletion_in_progress"
        ) {
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
            input: body.input,
            streamId: body.streamId,
            signupAtMs: auth.user.createdAt,
        });

        if (quotaReservation.status === "blocked") {
            return new Response(STREAM_ERROR_MARKER, {
                status: quotaReservation.httpStatus,
                headers: responseHeaders(),
            });
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
        if (!auth.isAnonymous && (await isSapopinguinoUserDeletionInProgress(ctx, auth.userId))) {
            if (usageEventId) {
                try {
                    await stopSapopinguinoQuota(ctx, usageEventId, false);
                } catch (error) {
                    console.error("Failed to stop sapopinguino quota during account deletion:", error);
                }
            }

            return new Response(STREAM_ERROR_MARKER, {
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
                console.error("Failed to mark sapopinguino quota as failed before charge:", error);
            }
        }

        return new Response(STREAM_ERROR_MARKER, {
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
                      console.error("Failed to monitor sapopinguino stream stop state:", error);
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
                    console.error("Failed to finalize sapopinguino quota state:", error);
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
                            console.error("Failed to mark sapopinguino quota as completed:", error);
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
                        console.error("Failed to resolve sapopinguino abort state:", resolutionError);
                    }

                    await finalizeFailure(stopRequested || stopActionConsumed);
                } else {
                    enqueueLine(controller, encoder, STREAM_ERROR_MARKER);
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

    let body: StreamStopRequestBody;
    try {
        body = (await request.json()) as StreamStopRequestBody;
    } catch {
        return new Response(JSON.stringify({ ok: false }), {
            status: 400,
            headers: responseHeaders("application/json; charset=utf-8"),
        });
    }

    if (typeof body.streamId !== "string" || body.streamId.length === 0) {
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
