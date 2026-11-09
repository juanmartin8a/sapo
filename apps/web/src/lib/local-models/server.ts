import { normalizeServerUrl, LOCAL_OUTPUT_TOKENS } from "./config";
import { localTranslationInstructions } from "./prompt";
import type { TranslationRequest } from "@/types/translation";

export interface ServerConnection {
    baseUrl: string;
    apiKey: string;
}
const CONNECTION_ERROR =
    "Couldn’t reach the local server. Check its URL, start the server, allow this website in its CORS settings, and grant local network access if your browser asks.";

async function serverFetch(
    connection: ServerConnection,
    path: string,
    signal: AbortSignal,
    body?: unknown,
) {
    const url = `${normalizeServerUrl(connection.baseUrl)}/${path}`;
    let response: Response;
    try {
        response = await fetch(url, {
            method: body === undefined ? "GET" : "POST",
            credentials: "omit",
            cache: "no-store",
            redirect: "error",
            signal,
            headers: {
                ...(body === undefined ? {} : { "Content-Type": "application/json" }),
                ...(connection.apiKey.trim()
                    ? { Authorization: `Bearer ${connection.apiKey.trim()}` }
                    : {}),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
    } catch (error) {
        if (signal.aborted) throw signal.reason;
        throw new Error(CONNECTION_ERROR, { cause: error });
    }
    if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        if (response.status === 401 || response.status === 403)
            throw new Error(
                "The local server rejected access. Check its API key and allowed origins in Settings.",
            );
        if (path === "responses" && (response.status === 404 || response.status === 405))
            throw new Error(
                "This server does not expose the Responses API at this URL. Update the server and check that the API URL ends in /v1.",
            );
        throw new Error(
            `The local server returned HTTP ${response.status}. Check its model and server logs.`,
        );
    }
    return response;
}

export async function listServerModels(
    connection: ServerConnection,
    signal: AbortSignal,
): Promise<string[]> {
    const deadline = AbortSignal.timeout(15_000);
    const response = await serverFetch(connection, "models", AbortSignal.any([signal, deadline]));
    const json = await response.json();
    if (!json || !Array.isArray(json.data))
        throw new Error(
            "The server returned an invalid model list. You can enter a model ID manually in Settings.",
        );
    return [
        ...new Set<string>(
            json.data.flatMap((model: unknown) =>
                model &&
                typeof model === "object" &&
                "id" in model &&
                typeof model.id === "string" &&
                model.id.length <= 512 &&
                model.id.trim()
                    ? [model.id.trim()]
                    : [],
            ),
        ),
    ].sort();
}

type EventObject = Record<string, unknown>;
function object(value: unknown): EventObject {
    return value && typeof value === "object" ? (value as EventObject) : {};
}

export async function readResponseStream(
    body: ReadableStream<Uint8Array>,
    onText: (text: string) => void,
    signal: AbortSignal,
) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let skipLf = false;
    let data: string[] = [];
    let eventSize = 0;
    let eventName = "";
    let completed = false;
    let output = "";
    const cancel = () => {
        void reader.cancel().catch(() => undefined);
    };
    signal.addEventListener("abort", cancel, { once: true });
    const emit = () => {
        if (!data.length) {
            eventName = "";
            return;
        }
        const payload = data.join("\n");
        data = [];
        eventSize = 0;
        if (payload === "[DONE]") {
            eventName = "";
            return;
        }
        let event: EventObject;
        try {
            event = object(JSON.parse(payload));
        } catch {
            throw new Error("The local server sent an invalid Responses stream.");
        }
        const type = event.type ?? eventName;
        eventName = "";
        if (type === "response.output_text.delta" && typeof event.delta === "string") {
            output += event.delta;
            onText(event.delta);
        } else if (type === "response.refusal.delta" || type === "response.refusal.done") {
            throw new Error("The model declined to translate this text.");
        } else if (type === "error" || type === "response.failed") {
            throw new Error(
                "The local model could not complete the translation. Check the server logs or try another model.",
            );
        } else if (type === "response.incomplete") {
            throw new Error(
                "The translation was cut short. Try a shorter input or a model with a larger context.",
            );
        } else if (type === "response.completed") {
            const response = object(event.response);
            if (response.status && response.status !== "completed")
                throw new Error("The local model did not finish the translation.");
            // Some compatible servers return output only in the terminal event.
            if (!output && Array.isArray(response.output)) {
                for (const item of response.output) {
                    const message = object(item);
                    if (message.type !== "message" || !Array.isArray(message.content)) continue;
                    for (const part of message.content) {
                        const content = object(part);
                        if (content.type === "output_text" && typeof content.text === "string") {
                            output += content.text;
                            onText(content.text);
                        }
                    }
                }
            }
            completed = true;
        }
    };
    const line = (value: string) => {
        if (!value) emit();
        else if (value.startsWith("data:")) {
            eventSize += value.length;
            if (eventSize > 1_048_576)
                throw new Error("The local server sent an oversized stream event.");
            data.push(value.slice(5).replace(/^ /, ""));
        } else if (value.startsWith("event:")) eventName = value.slice(6).trim();
    };
    try {
        while (!completed) {
            signal.throwIfAborted();
            const { done, value } = await reader.read();
            signal.throwIfAborted();
            buffer += decoder.decode(value, { stream: !done });
            if (skipLf && buffer) {
                if (buffer.startsWith("\n")) buffer = buffer.slice(1);
                skipLf = false;
            }
            if (buffer.length > 1_048_576)
                throw new Error("The local server sent an oversized stream event.");
            let end: number;
            while ((end = buffer.search(/[\r\n]/)) >= 0 && !completed) {
                const cr = buffer[end] === "\r";
                line(buffer.slice(0, end));
                buffer = buffer.slice(end + 1);
                if (cr) {
                    if (buffer.startsWith("\n")) buffer = buffer.slice(1);
                    else if (!buffer) skipLf = true;
                }
            }
            if (done) {
                if (buffer) line(buffer);
                emit();
                break;
            }
        }
        if (!completed)
            throw new Error(
                "The local server disconnected before finishing the translation. Please try again.",
            );
        if (!output.trim())
            throw new Error("The local model returned no translation. Try another model.");
    } finally {
        signal.removeEventListener("abort", cancel);
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }
}

export async function translateOnServer(
    connection: ServerConnection,
    model: string,
    request: TranslationRequest,
    signal: AbortSignal,
    onText: (text: string) => void,
) {
    if (!model.trim()) throw new Error("Select a local model or enter its model ID in Settings.");
    const instructions = localTranslationInstructions(request);
    const deadline = AbortSignal.timeout(10 * 60_000);
    const combined = AbortSignal.any([signal, deadline]);
    try {
        const response = await serverFetch(connection, "responses", combined, {
            model,
            instructions,
            input: request.input,
            stream: true,
            store: false,
            max_output_tokens: LOCAL_OUTPUT_TOKENS,
        });
        if (
            !response.body ||
            !response.headers.get("content-type")?.includes("text/event-stream")
        ) {
            void response.body?.cancel().catch(() => undefined);
            throw new Error(
                "This server did not return a streaming Responses API result. Update the server or choose another one.",
            );
        }
        await readResponseStream(response.body, onText, combined);
    } catch (error) {
        if (signal.aborted) throw signal.reason;
        if (deadline.aborted)
            throw new Error("The local model timed out. Try a smaller model or shorter text.", {
                cause: error,
            });
        throw error;
    }
}
