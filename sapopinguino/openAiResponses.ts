const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_RESPONSES_TOTAL_TIMEOUT_MS = 120_000;
const OPENAI_RESPONSES_STREAM_IDLE_TIMEOUT_MS = 20_000;

export const STREAM_END_MARKER = "<end:)>";
export const STREAM_ERROR_MARKER = "<error:/>";

type OpenAIStreamEvent = {
    type?: string;
    delta?: string;
};

type OpenAIStreamStep = "continue" | "completed" | "errored";
type OpenAIAbortReason = "external" | "total_timeout" | "stream_idle_timeout";

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

export async function streamOpenAIResponses(args: {
    input: string;
    promptId: string | undefined;
    promptVersion: string | undefined;
    signal: AbortSignal;
    onDelta: (delta: string) => Promise<OpenAIStreamStep>;
    onCompleted: () => Promise<void> | void;
    onErrored: () => Promise<void> | void;
}): Promise<"completed" | "errored"> {
    const openAIKey = process.env.OPENAI_API_KEY;

    if (!openAIKey) {
        await args.onErrored();
        return "errored";
    }

    const streamAbortController = new AbortController();
    let abortReason: OpenAIAbortReason | null = null;
    let totalTimeout: ReturnType<typeof setTimeout> | null = null;
    let streamIdleTimeout: ReturnType<typeof setTimeout> | null = null;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    const abortStream = (reason: OpenAIAbortReason) => {
        if (streamAbortController.signal.aborted) {
            return;
        }

        abortReason = reason;
        streamAbortController.abort();
    };

    const clearTotalTimeout = () => {
        if (totalTimeout !== null) {
            clearTimeout(totalTimeout);
            totalTimeout = null;
        }
    };

    const clearStreamIdleTimeout = () => {
        if (streamIdleTimeout !== null) {
            clearTimeout(streamIdleTimeout);
            streamIdleTimeout = null;
        }
    };

    const refreshStreamIdleTimeout = () => {
        clearStreamIdleTimeout();

        if (!streamAbortController.signal.aborted) {
            streamIdleTimeout = setTimeout(
                () => abortStream("stream_idle_timeout"),
                OPENAI_RESPONSES_STREAM_IDLE_TIMEOUT_MS
            );
        }
    };

    const abortFromExternalSignal = () => abortStream("external");

    if (args.signal.aborted) {
        abortFromExternalSignal();
    } else {
        args.signal.addEventListener("abort", abortFromExternalSignal, { once: true });
    }

    totalTimeout = setTimeout(() => abortStream("total_timeout"), OPENAI_RESPONSES_TOTAL_TIMEOUT_MS);

    try {
        const upstreamResponse = await fetch(OPENAI_RESPONSES_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${openAIKey}`,
                "Content-Type": "application/json",
                Accept: "text/event-stream",
            },
            body: JSON.stringify({
                prompt: {
                    id: args.promptId,
                    version: args.promptVersion,
                },
                input: args.input,
                stream: true,
            }),
            signal: streamAbortController.signal,
        });

        if (!upstreamResponse.ok || upstreamResponse.body === null) {
            await args.onErrored();
            return "errored";
        }

        reader = upstreamResponse.body.getReader();
        const textDecoder = new TextDecoder();
        let eventBuffer = "";
        refreshStreamIdleTimeout();

        const handleDataPayload = async (dataPayload: string): Promise<OpenAIStreamStep> => {
            if (dataPayload === "[DONE]") {
                await args.onCompleted();
                return "completed";
            }

            let parsedEvent: OpenAIStreamEvent;
            try {
                parsedEvent = JSON.parse(dataPayload) as OpenAIStreamEvent;
            } catch {
                return "continue";
            }

            if (
                parsedEvent.type === "error" ||
                parsedEvent.type?.endsWith(".error") ||
                parsedEvent.type === "response.failed" ||
                parsedEvent.type?.endsWith(".failed") ||
                parsedEvent.type === "response.incomplete"
            ) {
                await args.onErrored();
                return "errored";
            }

            if (parsedEvent.type === "response.completed") {
                await args.onCompleted();
                return "completed";
            }

            if (parsedEvent.type !== "response.output_text.delta" || typeof parsedEvent.delta !== "string") {
                return "continue";
            }

            return args.onDelta(parsedEvent.delta);
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            refreshStreamIdleTimeout();
            eventBuffer += textDecoder.decode(value, { stream: true });
            const { events, remainder } = sseEventsFromChunkBuffer(eventBuffer);
            eventBuffer = remainder;

            for (const rawEvent of events) {
                const dataPayload = readSSEDataLines(rawEvent);
                if (dataPayload === null) {
                    continue;
                }

                const nextStep = await handleDataPayload(dataPayload);
                if (nextStep !== "continue") {
                    return nextStep;
                }
            }
        }

        eventBuffer += textDecoder.decode();

        if (eventBuffer.trim().length > 0) {
            const trailingPayload = readSSEDataLines(eventBuffer);
            if (trailingPayload !== null) {
                const nextStep = await handleDataPayload(trailingPayload);
                if (nextStep !== "continue") {
                    return nextStep;
                }
            }
        }

        await args.onErrored();
        return "errored";
    } catch (error) {
        if ((error as Error).name === "AbortError" && abortReason !== "external") {
            await args.onErrored();
            return "errored";
        }

        throw error;
    } finally {
        if (!streamAbortController.signal.aborted) {
            streamAbortController.abort();
        }

        if (reader) {
            try {
                await reader.cancel();
            } catch {
                // The abort may have already closed the response stream.
            }
        }

        args.signal.removeEventListener("abort", abortFromExternalSignal);
        clearTotalTimeout();
        clearStreamIdleTimeout();
    }
}
