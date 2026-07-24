import { fetch as expoFetch } from "expo/fetch";

import { ABORT_ERROR_NAME } from "@/constants/errors";
import { getConvexAccessTokenWithUserId } from "@/lib/auth-client";
import type { TransformationOperation } from "@/types/translation";

const STREAM_END_MARKER = "<end:)>";
const STREAM_ERROR_MARKER = "<error:/>";
const STREAM_RESPONSE_TIMEOUT_MS = 15_000;
const STREAM_IDLE_TIMEOUT_MS = 20_000;
const STREAM_TOTAL_TIMEOUT_MS = 135_000;

export type TranslationStreamToken = {
    type: string;
    input?: string;
    transcription?: string;
    output?: string;
    value?: string;
};

export type TranslationStreamArguments = {
    operation: TransformationOperation;
    convexSiteUrl: string;
    inputLanguage: string;
    targetLanguage: string;
    input: string;
    streamId: string;
    abortController: AbortController;
};

export type TranslationStreamCallbacks = {
    isActive: () => boolean;
    onToken: (token: TranslationStreamToken) => "continue" | "stop";
    onDone: () => void;
    onStreamError: (message: string, source: "event" | "marker") => void;
};

type TranslationStreamTimeoutReason = "response" | "idle" | "total";

type TranslationStreamResult =
    | { type: "completed" }
    | { type: "stopped" }
    | { type: "inactive" }
    | { type: "cancelled" }
    | { type: "timeout"; reason: TranslationStreamTimeoutReason }
    | { type: "auth-error" }
    | { type: "http-error"; status: number; message: string }
    | { type: "protocol-error"; error: unknown }
    | { type: "transport-error"; error: unknown };

type ParsedSSEEvent = {
    event: string | null;
    data: string | null;
};

type PayloadResult =
    | { type: "continue" }
    | { type: "stop" }
    | { type: "protocol-error"; error: unknown };

export function getTranslationStreamEndpointPath(operation: TransformationOperation) {
    return operation === "translate" ? "/sapopinguino-translate" : "/sapopinguino";
}

function splitSSEEventsFromChunkBuffer(chunkBuffer: string): { events: string[]; remainder: string } {
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

function splitLinesFromChunkBuffer(chunkBuffer: string): { lines: string[]; remainder: string } {
    const normalized = chunkBuffer.replace(/\r\n/g, "\n");
    const lines: string[] = [];

    let cursor = 0;
    let boundary = normalized.indexOf("\n", cursor);

    while (boundary !== -1) {
        lines.push(normalized.slice(cursor, boundary));
        cursor = boundary + 1;
        boundary = normalized.indexOf("\n", cursor);
    }

    return {
        lines,
        remainder: normalized.slice(cursor),
    };
}

function parseSSEEvent(rawEvent: string): ParsedSSEEvent {
    const lines = rawEvent.split("\n");
    const dataLines: string[] = [];
    let event: string | null = null;

    for (const line of lines) {
        if (line.startsWith("event:")) {
            const eventValue = line.slice(6);
            event = (eventValue.startsWith(" ") ? eventValue.slice(1) : eventValue).trim();
            continue;
        }

        if (line.startsWith("data:")) {
            const dataValue = line.slice(5);
            dataLines.push(dataValue.startsWith(" ") ? dataValue.slice(1) : dataValue);
        }
    }

    if (dataLines.length === 0) {
        return { event, data: null };
    }

    return {
        event,
        data: dataLines.join("\n"),
    };
}

function getStreamErrorMessageFromCode(errorCode: string | null, status: number) {
    if (errorCode === "monthly_limit_exceeded" || status === 429) {
        return "Quota limit reached.";
    }

    if (errorCode === "input_limit_exceeded") {
        return "Input limit reached.";
    }

    if (errorCode === "user_deletion_in_progress") {
        return "Account deletion is in progress.";
    }

    return "An error occurred";
}

function resolveStreamErrorMessage(responseText: string, status: number) {
    if (responseText.trim().length === 0) {
        return getStreamErrorMessageFromCode(null, status);
    }

    try {
        const parsedResponse = JSON.parse(responseText) as unknown;

        if (typeof parsedResponse === "object" && parsedResponse !== null) {
            const typedResponse = parsedResponse as { error?: unknown; message?: unknown };

            if (typeof typedResponse.error === "string") {
                return getStreamErrorMessageFromCode(typedResponse.error, status);
            }
        }
    } catch {
        return getStreamErrorMessageFromCode(null, status);
    }

    return getStreamErrorMessageFromCode(null, status);
}

async function readStreamErrorMessage(response: Response) {
    try {
        return resolveStreamErrorMessage(await response.text(), response.status);
    } catch {
        return getStreamErrorMessageFromCode(null, response.status);
    }
}

function parseToken(payload: string, operation: TransformationOperation): TranslationStreamToken {
    if (operation === "translate") {
        return {
            type: "translate",
            value: payload,
        };
    }

    const parsed = JSON.parse(payload) as TranslationStreamToken;
    if (typeof parsed !== "object" || parsed === null || typeof parsed.type !== "string") {
        throw new Error("Invalid respell token payload");
    }

    return parsed;
}

function processTokenPayload(
    payload: string,
    operation: TransformationOperation,
    callbacks: TranslationStreamCallbacks
): PayloadResult {
    if (!callbacks.isActive()) {
        return { type: "stop" };
    }

    if (payload === STREAM_END_MARKER) {
        callbacks.onDone();
        return { type: "stop" };
    }

    if (payload === STREAM_ERROR_MARKER) {
        callbacks.onStreamError("An error occurred", "marker");
        return { type: "stop" };
    }

    try {
        return { type: callbacks.onToken(parseToken(payload, operation)) };
    } catch (error) {
        return { type: "protocol-error", error };
    }
}

function processSSEEvent(
    rawEvent: string,
    operation: TransformationOperation,
    callbacks: TranslationStreamCallbacks
): PayloadResult {
    const { event, data } = parseSSEEvent(rawEvent);
    if (data === null) {
        return { type: "continue" };
    }

    if (event === "error") {
        callbacks.onStreamError(
            data === STREAM_ERROR_MARKER ? "An error occurred" : resolveStreamErrorMessage(data, 500),
            "event"
        );
        return { type: "stop" };
    }

    if (event === "done") {
        callbacks.onDone();
        return { type: "stop" };
    }

    return processTokenPayload(data, operation, callbacks);
}

function toStreamResult(result: PayloadResult): TranslationStreamResult | null {
    if (result.type === "continue") {
        return null;
    }

    if (result.type === "stop") {
        return { type: "stopped" };
    }

    return result;
}

export async function runTranslationStream(
    args: TranslationStreamArguments,
    callbacks: TranslationStreamCallbacks
): Promise<TranslationStreamResult> {
    const endpointPath = getTranslationStreamEndpointPath(args.operation);
    const streamUrl = `${args.convexSiteUrl.replace(/\/$/, "")}${endpointPath}`;
    const requestInput = JSON.stringify({
        input_language: args.inputLanguage,
        target_language: args.targetLanguage,
        input: args.input,
    });
    let streamTimeoutReason: TranslationStreamTimeoutReason | null = null;
    let responseTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let totalTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const clearResponseTimeout = () => {
        if (responseTimeoutId !== null) {
            clearTimeout(responseTimeoutId);
            responseTimeoutId = null;
        }
    };

    const clearIdleTimeout = () => {
        if (idleTimeoutId !== null) {
            clearTimeout(idleTimeoutId);
            idleTimeoutId = null;
        }
    };

    const clearTotalTimeout = () => {
        if (totalTimeoutId !== null) {
            clearTimeout(totalTimeoutId);
            totalTimeoutId = null;
        }
    };

    const abortStreamForTimeout = (reason: TranslationStreamTimeoutReason) => {
        if (args.abortController.signal.aborted) {
            return;
        }

        streamTimeoutReason = reason;
        args.abortController.abort();
    };

    const refreshIdleTimeout = () => {
        clearIdleTimeout();
        idleTimeoutId = setTimeout(
            () => abortStreamForTimeout("idle"),
            STREAM_IDLE_TIMEOUT_MS
        );
    };

    try {
        totalTimeoutId = setTimeout(
            () => abortStreamForTimeout("total"),
            STREAM_TOTAL_TIMEOUT_MS
        );

        const authContext = await getConvexAccessTokenWithUserId();
        const convexToken = authContext?.token ?? null;

        if (!convexToken || !authContext?.userId || !callbacks.isActive()) {
            return callbacks.isActive() ? { type: "auth-error" } : { type: "inactive" };
        }

        responseTimeoutId = setTimeout(
            () => abortStreamForTimeout("response"),
            STREAM_RESPONSE_TIMEOUT_MS
        );

        let response: Response;

        try {
            response = await expoFetch(streamUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "text/event-stream",
                    Authorization: `Bearer ${convexToken}`,
                },
                body: JSON.stringify({ input: requestInput, streamId: args.streamId }),
                signal: args.abortController.signal,
            });
        } finally {
            clearResponseTimeout();
        }

        if (!response.ok) {
            if (!callbacks.isActive()) {
                return { type: "inactive" };
            }

            return {
                type: "http-error",
                status: response.status,
                message: await readStreamErrorMessage(response),
            };
        }

        const contentType = response.headers.get("content-type") ?? "";
        const responseBody = response.body;

        if (!responseBody || typeof responseBody.getReader !== "function") {
            const fullText = await response.text();

            if (!callbacks.isActive()) {
                return { type: "inactive" };
            }

            if (contentType.includes("text/event-stream")) {
                const { events, remainder } = splitSSEEventsFromChunkBuffer(fullText);

                for (const rawEvent of events) {
                    const result = toStreamResult(processSSEEvent(rawEvent, args.operation, callbacks));
                    if (result) {
                        return result;
                    }
                }

                if (remainder.trim().length > 0) {
                    const result = toStreamResult(processSSEEvent(remainder, args.operation, callbacks));
                    if (result) {
                        return result;
                    }
                }
            } else {
                const normalized = fullText.replace(/\r\n/g, "\n");
                const lines = normalized.split("\n");

                for (const line of lines) {
                    if (line.length === 0) {
                        continue;
                    }

                    const result = toStreamResult(processTokenPayload(line, args.operation, callbacks));
                    if (result) {
                        return result;
                    }
                }
            }

            return { type: "completed" };
        }

        const reader = responseBody.getReader();
        const decoder = new TextDecoder();

        if (contentType.includes("text/event-stream")) {
            let eventBuffer = "";
            refreshIdleTimeout();

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }

                refreshIdleTimeout();

                if (!callbacks.isActive()) {
                    return { type: "inactive" };
                }

                eventBuffer += decoder.decode(value, { stream: true });
                const { events, remainder } = splitSSEEventsFromChunkBuffer(eventBuffer);
                eventBuffer = remainder;

                for (const rawEvent of events) {
                    const result = toStreamResult(processSSEEvent(rawEvent, args.operation, callbacks));
                    if (result) {
                        return result;
                    }
                }
            }

            if (eventBuffer.trim().length > 0) {
                const result = toStreamResult(processSSEEvent(eventBuffer, args.operation, callbacks));
                if (result) {
                    return result;
                }
            }
        } else {
            let lineBuffer = "";
            refreshIdleTimeout();

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }

                refreshIdleTimeout();

                if (!callbacks.isActive()) {
                    return { type: "inactive" };
                }

                lineBuffer += decoder.decode(value, { stream: true });
                const { lines, remainder } = splitLinesFromChunkBuffer(lineBuffer);
                lineBuffer = remainder;

                for (const line of lines) {
                    if (line.length === 0) {
                        continue;
                    }

                    const result = toStreamResult(processTokenPayload(line, args.operation, callbacks));
                    if (result) {
                        return result;
                    }
                }
            }

            if (lineBuffer.length > 0) {
                const result = toStreamResult(processTokenPayload(lineBuffer, args.operation, callbacks));
                if (result) {
                    return result;
                }
            }
        }

        return { type: "completed" };
    } catch (error) {
        if ((error as Error).name === ABORT_ERROR_NAME) {
            return streamTimeoutReason === null
                ? { type: "cancelled" }
                : { type: "timeout", reason: streamTimeoutReason };
        }

        return { type: "transport-error", error };
    } finally {
        clearResponseTimeout();
        clearIdleTimeout();
        clearTotalTimeout();
    }
}
