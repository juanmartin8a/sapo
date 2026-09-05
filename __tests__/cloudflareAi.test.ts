import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { streamCloudflareAI } from "../model/sapopinguino/cloudflareAi";
import { respellPrompt, translatePrompt } from "../model/sapopinguino/prompts.generated";
import respellSchema from "../prompts/respell.schema.json";

function sse(...events: unknown[]) {
    return events.map(event => `data: ${typeof event === "string" ? event : JSON.stringify(event)}\r\n\r\n`).join("");
}

function respond(text: string) {
    // Split at every byte, including inside CRLF delimiters and multibyte Unicode.
    const bytes = new TextEncoder().encode(text);
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new ReadableStream({
        start(controller) {
            for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
            controller.close();
        },
    })));
}

function callbacks(operation: "respell" | "translate" = "respell") {
    return {
        operation,
        input: JSON.stringify({ input_language: "English", target_language: "Spanish", input: "Hello 😄" }),
        signal: new AbortController().signal,
        onDelta: jest.fn(async (_delta: string) => "continue" as const),
        onCompleted: jest.fn<() => void>(),
        onErrored: jest.fn<() => void>(),
    };
}

const envKeys = ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_AI_GATEWAY_ID", "CLOUDFLARE_API_TOKEN"] as const;
const savedEnv = envKeys.map(key => process.env[key]);

beforeEach(() => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "account";
    process.env.CLOUDFLARE_AI_GATEWAY_ID = "gateway";
    process.env.CLOUDFLARE_API_TOKEN = "test-cloudflare-token";
    jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    envKeys.forEach((key, index) => {
        if (savedEnv[index] === undefined) delete process.env[key];
        else process.env[key] = savedEnv[index];
    });
    jest.restoreAllMocks();
    jest.useRealTimers();
});

describe("Cloudflare AI streams", () => {
    it("bundles the Markdown prompts without drift", () => {
        expect(respellPrompt).toBe(readFileSync(join(__dirname, "../prompts/respell.md"), "utf8"));
        expect(translatePrompt).toBe(readFileSync(join(__dirname, "../prompts/translate.md"), "utf8"));
    });

    it("routes respelling through authenticated Gateway with local instructions and no reasoning", async () => {
        respond(sse(
            { type: "response.output_text.delta", delta: '{"tokens":[["word","Hello","Jeló"]]}' },
            { type: "response.completed" },
        ));
        const args = callbacks();
        expect(await streamCloudflareAI(args)).toBe("completed");
        expect(args.onDelta).toHaveBeenCalledWith('{"tokens":[["word","Hello","Jeló"]]}');
        expect(args.onCompleted).toHaveBeenCalledTimes(1);
        expect(args.onErrored).not.toHaveBeenCalled();
        const [url, init] = jest.mocked(fetch).mock.calls[0];
        expect(url).toBe("https://gateway.ai.cloudflare.com/v1/account/gateway/openai/responses");
        expect(init?.headers).toMatchObject({ "cf-aig-authorization": "Bearer test-cloudflare-token" });
        expect(init?.headers).not.toHaveProperty("Authorization");
        const body = JSON.parse(init?.body as string);
        expect(body).toMatchObject({ model: "gpt-5.6-luna", instructions: respellPrompt, input: args.input, reasoning: { effort: "none" }, stream: true, store: false });
        expect(body).not.toHaveProperty("prompt");
        expect(body.text.format).toEqual({ type: "json_schema", ...respellSchema });
        expect(body.text.format.name).toBe("sapopinguino");
        expect(body.text.format.strict).toBe(true);
        expect(body.text.format).not.toHaveProperty("json_schema");
    });

    it("streams Gemma content only, including final content, with thinking disabled", async () => {
        delete process.env.CLOUDFLARE_AI_GATEWAY_ID;
        respond(sse(
            { choices: [{ index: 0, delta: { reasoning_content: "private", reasoning: "private" } }] },
            { choices: [{ index: 0, delta: { content: "Hola " }, finish_reason: null }] },
            { choices: [{ index: 0, delta: { content: "😄" }, finish_reason: "stop" }] },
            "[DONE]",
        ));
        const args = callbacks("translate");
        expect(await streamCloudflareAI(args)).toBe("completed");
        expect(args.onDelta.mock.calls.map(([delta]) => delta).join("")).toBe("Hola 😄");
        expect(args.onCompleted).toHaveBeenCalledTimes(1);
        const [url, init] = jest.mocked(fetch).mock.calls[0];
        expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/account/ai/v1/chat/completions");
        expect(init?.headers).toMatchObject({ Authorization: "Bearer test-cloudflare-token" });
        expect(JSON.parse(init?.body as string)).toMatchObject({
            model: "@cf/google/gemma-4-26b-a4b-it",
            chat_template_kwargs: { enable_thinking: false },
            messages: [{ role: "system", content: translatePrompt }, { role: "user", content: args.input }],
        });
    });

    it.each([
        ["respell", sse({ type: "response.incomplete" })],
        ["respell", sse({ type: "response.failed" })],
        ["respell", sse({ type: "response.refusal.delta", delta: "refused" })],
        ["translate", sse({ error: { message: "unavailable" } })],
        ["translate", sse({ choices: [{ index: 0, finish_reason: "length" }] }, "[DONE]")],
        ["translate", sse({ choices: [{ index: 0, finish_reason: "content_filter" }] })],
        ["translate", sse("[DONE]")],
        ["respell", sse("not json")],
        ["respell", sse("null")],
        ["respell", sse({ type: "response.output_text.delta", delta: "partial" })],
    ] as ["respell" | "translate", string][])("fails %s incomplete/error streams", async (operation, text) => {
        respond(text);
        const args = callbacks(operation);
        expect(await streamCloudflareAI(args)).toBe("errored");
        expect(args.onErrored).toHaveBeenCalledTimes(1);
        expect(args.onCompleted).not.toHaveBeenCalled();
    });

    it("fails without fetching when configuration is absent", async () => {
        delete process.env.CLOUDFLARE_API_TOKEN;
        const fetchMock = jest.spyOn(globalThis, "fetch");
        const args = callbacks();
        expect(await streamCloudflareAI(args)).toBe("errored");
        expect(fetchMock).not.toHaveBeenCalled();
        expect(args.onErrored).toHaveBeenCalledTimes(1);
    });

    it("handles upstream HTTP errors", async () => {
        jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("error", { status: 429 }));
        const args = callbacks();
        expect(await streamCloudflareAI(args)).toBe("errored");
        expect(args.onCompleted).not.toHaveBeenCalled();
        expect(args.onErrored).toHaveBeenCalledTimes(1);
    });

    it("stops when the consumer rejects a delta", async () => {
        respond(sse({ type: "response.output_text.delta", delta: "one" }, { type: "response.completed" }));
        const args = { ...callbacks(), onDelta: jest.fn(async () => "errored" as const) };
        expect(await streamCloudflareAI(args)).toBe("errored");
        expect(args.onCompleted).not.toHaveBeenCalled();
        expect(jest.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
    });

    it("propagates external cancellation", async () => {
        const controller = new AbortController();
        jest.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        }));
        const args = { ...callbacks(), signal: controller.signal };
        const result = streamCloudflareAI(args);
        controller.abort();
        await expect(result).rejects.toMatchObject({ name: "AbortError" });
        expect(args.onErrored).not.toHaveBeenCalled();
    });

    it("fails when upstream never sends headers before the total timeout", async () => {
        jest.useFakeTimers();
        jest.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        }));
        const args = callbacks();
        const result = streamCloudflareAI(args);
        await jest.advanceTimersByTimeAsync(120_000);
        expect(await result).toBe("errored");
        expect(args.onErrored).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(0);
    });

    it("fails stalled streams and releases timers", async () => {
        jest.useFakeTimers();
        jest.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => new Response(new ReadableStream({
            start(controller) {
                init?.signal?.addEventListener("abort", () => controller.error(Object.assign(new Error("aborted"), { name: "AbortError" })));
            },
        })));
        const args = callbacks("translate");
        const result = streamCloudflareAI(args);
        await jest.advanceTimersByTimeAsync(20_000);
        expect(await result).toBe("errored");
        expect(args.onErrored).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(0);
    });
});
