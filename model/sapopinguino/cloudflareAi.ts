import { ABORT_ERROR_NAME } from "../../constants/errors";

import { respellPrompt, translatePrompt } from "./prompts.generated";
import { RESPELL_LANGUAGES } from "./languages";
import respellSchema from "../../prompts/respell.schema.json";
const AI_TOTAL_TIMEOUT_MS = 120_000;
const AI_STREAM_IDLE_TIMEOUT_MS = 20_000;

type AIStreamEvent = {
    type?: string;
    delta?: string;
    error?: unknown;
    choices?: {
        index?: number;
        delta?: { content?: string | null; refusal?: string | null };
        finish_reason?: string | null;
    }[];
};

type AIStreamStep = "continue" | "completed" | "errored";
type AIAbortReason = "external" | "total_timeout" | "stream_idle_timeout";

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

export async function streamCloudflareAI(args: {
    input: string;
    operation: "respell" | "translate";
    pipelineTranslation?: boolean;
    detectSourceLanguage?: boolean;
    signal: AbortSignal;
    onDelta: (delta: string) => Promise<AIStreamStep>;
    onCompleted: () => Promise<void> | void;
    onErrored: () => Promise<void> | void;
}): Promise<"completed" | "errored"> {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const gatewayId = process.env.CLOUDFLARE_AI_GATEWAY_ID?.trim();
    const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();

    const useResponses = args.operation === "respell" || args.pipelineTranslation === true;
    if (!accountId || !apiToken || (useResponses && !gatewayId)) {
        console.error("Cloudflare AI configuration missing", { operation: args.operation });
        await args.onErrored();
        return "errored";
    }

    const isRespell = args.operation === "respell";
    const url = useResponses
        ? `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(accountId)}/${encodeURIComponent(gatewayId!)}/openai/responses`
        : `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1/chat/completions`;
    const authHeaders: Record<string, string> = useResponses
        ? { "cf-aig-authorization": `Bearer ${apiToken}` }
        : { Authorization: `Bearer ${apiToken}` };
    const body = useResponses
        ? {
              model: "gpt-6-luna",
              instructions: isRespell ? respellPrompt : translatePrompt + (args.detectSourceLanguage
                  ? '\nOverride the plain-text output contract: return the required JSON object. First identify the dominant language of the ORIGINAL input as detectedSourceLanguage, then translate into translation. Use Unknown if ambiguous, unsupported, or no language can be identified. Never infer the source from the translated text.'
                  : ''),
              input: args.input,
              reasoning: { effort: "none" },
              ...(isRespell ? { text: { format: { type: "json_schema", ...respellSchema } } }
                  : args.detectSourceLanguage ? { text: { format: {
                      type: "json_schema", name: "translation_with_source", strict: true,
                      schema: {
                          type: "object",
                          properties: {
                              detectedSourceLanguage: { type: "string", enum: [...RESPELL_LANGUAGES, "Unknown"] },
                              translation: { type: "string" },
                          },
                          required: ["detectedSourceLanguage", "translation"],
                          additionalProperties: false,
                      },
                  } } } : {}),
              ...(!isRespell ? { max_output_tokens: 16_384 } : {}),
              store: false,
              stream: true,
          }
        : {
              model: "@cf/google/gemma-4-26b-a4b-it",
              messages: [
                  { role: "system", content: translatePrompt },
                  { role: "user", content: args.input },
              ],
              chat_template_kwargs: { enable_thinking: false },
              max_completion_tokens: 16_384,
              stream: true,
          };

    const streamAbortController = new AbortController();
    let abortReason: AIAbortReason | null = null;
    let totalTimeout: ReturnType<typeof setTimeout> | null = null;
    let streamIdleTimeout: ReturnType<typeof setTimeout> | null = null;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    const abortStream = (reason: AIAbortReason) => {
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
                AI_STREAM_IDLE_TIMEOUT_MS
            );
        }
    };

    const abortFromExternalSignal = () => abortStream("external");

    if (args.signal.aborted) {
        abortFromExternalSignal();
    } else {
        args.signal.addEventListener("abort", abortFromExternalSignal, { once: true });
    }

    totalTimeout = setTimeout(() => abortStream("total_timeout"), AI_TOTAL_TIMEOUT_MS);

    try {
        const upstreamResponse = await fetch(url, {
            method: "POST",
            headers: {
                ...authHeaders,
                "Content-Type": "application/json",
                Accept: "text/event-stream",
            },
            body: JSON.stringify(body),
            signal: streamAbortController.signal,
        });

        if (!upstreamResponse.ok || upstreamResponse.body === null) {
            console.error("Cloudflare AI request failed", {
                operation: args.operation,
                status: upstreamResponse.status,
            });
            await args.onErrored();
            return "errored";
        }

        reader = upstreamResponse.body.getReader();
        const textDecoder = new TextDecoder();
        let eventBuffer = "";
        refreshStreamIdleTimeout();

        const handleDataPayload = async (dataPayload: string): Promise<AIStreamStep> => {
            if (dataPayload === "[DONE]") {
                // A terminal success event is required; [DONE] alone can hide truncation.
                await args.onErrored();
                return "errored";
            }

            let parsedEvent: AIStreamEvent;
            try {
                parsedEvent = JSON.parse(dataPayload) as AIStreamEvent;
            } catch {
                await args.onErrored();
                return "errored";
            }

            if (!parsedEvent || typeof parsedEvent !== "object") {
                await args.onErrored();
                return "errored";
            }

            if (
                parsedEvent.error != null ||
                parsedEvent.type === "response.refusal.delta" ||
                parsedEvent.type === "error" ||
                parsedEvent.type?.endsWith(".error") ||
                parsedEvent.type === "response.failed" ||
                parsedEvent.type?.endsWith(".failed") ||
                parsedEvent.type === "response.incomplete"
            ) {
                await args.onErrored();
                return "errored";
            }

            if (!useResponses) {
                const choice = parsedEvent.choices?.find((item) => item.index === 0);
                if (!choice) return "continue";
                if (choice.delta?.refusal || (choice.finish_reason && choice.finish_reason !== "stop")) {
                    await args.onErrored();
                    return "errored";
                }
                // Only content is public output. Never forward reasoning_content or reasoning.
                const content = choice.delta?.content;
                if (typeof content === "string" && content.length > 0) {
                    const step = await args.onDelta(content);
                    if (step !== "continue") return step;
                }
                if (choice.finish_reason === "stop") {
                    await args.onCompleted();
                    return "completed";
                }
                return "continue";
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
        if ((error as Error).name === ABORT_ERROR_NAME && abortReason !== "external") {
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
