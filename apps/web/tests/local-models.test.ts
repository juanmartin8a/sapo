import assert from "node:assert/strict";
import { test } from "node:test";
import {
    DEFAULT_LOCAL_PREFERENCES,
    normalizeServerUrl,
    parseLocalPreferences,
} from "../src/lib/local-models/config.ts";
import {
    readResponseStream,
    translateOnServer,
    listServerModels,
} from "../src/lib/local-models/server.ts";
import { validateModelFiles } from "../src/lib/local-models/files.ts";
import type { TranslationRequest } from "../src/types/translation.ts";

const request: TranslationRequest = {
    operation: "translate",
    input: "Hello",
    inputLanguage: "English",
    targetLanguage: "Spanish",
    translateThenRespell: false,
    respellLanguage: "Source",
};
const encoder = new TextEncoder();
const event = (type: string, data = {}) =>
    `event: ${type}\r\ndata: ${JSON.stringify({ type, ...data })}\r\n\r\n`;
const completed = event("response.completed", { response: { status: "completed" } });
function body(text: string, split = 7) {
    const bytes = encoder.encode(text);
    return new ReadableStream<Uint8Array>({
        start(controller) {
            for (let index = 0; index < bytes.length; index += split)
                controller.enqueue(bytes.slice(index, index + split));
            controller.close();
        },
    });
}

test("local preferences validate values and strip tokens, files, and text", () => {
    assert.deepEqual(parseLocalPreferences(null), DEFAULT_LOCAL_PREFERENCES);
    const saved = parseLocalPreferences({
        ...DEFAULT_LOCAL_PREFERENCES,
        apiKey: "secret",
        input: "private",
        enabled: "true",
        baseUrl: "javascript:alert(1)",
        source: "other",
        serverModel: 42,
    });
    assert.deepEqual(saved, DEFAULT_LOCAL_PREFERENCES);
    assert.equal(normalizeServerUrl(" http://localhost:1234/v1/ "), "http://localhost:1234/v1");
    for (const url of [
        "file:///model",
        "http://user:secret@localhost/v1",
        "http://localhost/v1?key=secret",
        "http://localhost/v1#secret",
        "localhost:1234",
    ])
        assert.throws(() => normalizeServerUrl(url));
});

test("Responses SSE survives split Unicode/CRLF and excludes reasoning", async () => {
    let output = "";
    await readResponseStream(
        body(
            ": heartbeat\r\n\r\n" +
                event("response.reasoning_text.delta", { delta: "private reasoning" }) +
                event("response.output_text.delta", { delta: "¡Hola 🐸!" }) +
                completed,
            1,
        ),
        (text) => (output += text),
        new AbortController().signal,
    );
    assert.equal(output, "¡Hola 🐸!");
});

test("Responses terminal-only text is supported without duplicating streamed text", async () => {
    const terminal = event("response.completed", {
        response: {
            status: "completed",
            output: [{ type: "message", content: [{ type: "output_text", text: "Hola" }] }],
        },
    });
    for (const text of [
        terminal,
        event("response.output_text.delta", { delta: "Hola" }) + terminal,
    ]) {
        let output = "";
        await readResponseStream(
            body(text),
            (part) => (output += part),
            new AbortController().signal,
        );
        assert.equal(output, "Hola");
    }
});

test("Responses SSE accepts CR line endings and multiline event data", async () => {
    for (const ending of ["\n", "\r", "\r\n"]) {
        let output = "";
        const text = [
            "event: response.output_text.delta",
            'data: {"delta":',
            'data: "Hola"}',
            "",
            "event: response.completed",
            'data: {"response":{"status":"completed"}}',
            "",
            "",
        ].join(ending);
        await readResponseStream(
            body(text, 1),
            (part) => (output += part),
            new AbortController().signal,
        );
        assert.equal(output, "Hola");
    }
});

for (const [name, text, error] of [
    ["truncation", event("response.output_text.delta", { delta: "Partial" }), /disconnected/],
    ["bare done marker", "data: [DONE]\n\n", /disconnected/],
    ["empty completion", completed, /no translation/],
    ["failure", event("response.failed"), /could not complete/],
    ["token limit", event("response.incomplete"), /cut short/],
    ["refusal", event("response.refusal.delta", { delta: "No" }), /declined/],
    ["invalid JSON", "data: {broken}\n\n", /invalid Responses/],
] as const)
    test(`Responses rejects ${name}`, async () => {
        await assert.rejects(
            readResponseStream(body(text), () => {}, new AbortController().signal),
            error,
        );
    });

test("stopping a waiting stream cancels its reader", async () => {
    const controller = new AbortController();
    let cancelled = false;
    const pending = readResponseStream(
        new ReadableStream({
            cancel() {
                cancelled = true;
            },
        }),
        () => assert.fail("late output"),
        controller.signal,
    );
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    assert.equal(cancelled, true);
});

test("server translation uses stateless Responses directly with optional auth", async (context) => {
    const mocked = context.mock.method(
        globalThis,
        "fetch",
        async (url: string, init: RequestInit) => {
            assert.equal(url, "http://localhost:1234/v1/responses");
            assert.equal(init.credentials, "omit");
            assert.equal(init.redirect, "error");
            assert.equal(
                (init.headers as Record<string, string>).Authorization,
                "Bearer local-secret",
            );
            const payload = JSON.parse(init.body as string);
            assert.equal(payload.model, "my-model");
            assert.equal(payload.input, "Hello");
            assert.equal(payload.store, false);
            assert.equal(payload.stream, true);
            assert.match(payload.instructions, /Spanish/);
            assert.equal(payload.previous_response_id, undefined);
            return new Response(
                body(event("response.output_text.delta", { delta: "Hola" }) + completed),
                { headers: { "content-type": "text/event-stream" } },
            );
        },
    );
    let output = "";
    await translateOnServer(
        { baseUrl: "http://localhost:1234/v1", apiKey: "local-secret" },
        "my-model",
        request,
        new AbortController().signal,
        (text) => (output += text),
    );
    assert.equal(output, "Hola");
    assert.equal(mocked.mock.callCount(), 1);
});

test("local respelling and excessive input fail before a network request", async (context) => {
    const mocked = context.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected network request");
    });
    for (const value of [
        { ...request, operation: "respell" as const },
        { ...request, input: "🐸".repeat(2001) },
    ])
        await assert.rejects(
            translateOnServer(
                { baseUrl: "http://localhost:1234/v1", apiKey: "" },
                "model",
                value,
                new AbortController().signal,
                () => {},
            ),
        );
    assert.equal(mocked.mock.callCount(), 0);
});

test("model discovery filters invalid IDs and deduplicates", async (context) => {
    context.mock.method(globalThis, "fetch", async () =>
        Response.json({
            data: [
                { id: "b" },
                { id: "a" },
                { id: " a " },
                null,
                { id: 3 },
                { id: "" },
                { id: "x".repeat(513) },
            ],
        }),
    );
    assert.deepEqual(
        await listServerModels(
            { baseUrl: "http://localhost:1234/v1", apiKey: "" },
            new AbortController().signal,
        ),
        ["a", "b"],
    );
});

test("unsupported Responses API fails with guidance and no fallback request", async (context) => {
    const mocked = context.mock.method(
        globalThis,
        "fetch",
        async () => new Response(null, { status: 404 }),
    );
    await assert.rejects(
        translateOnServer(
            { baseUrl: "http://localhost:1234/v1", apiKey: "" },
            "model",
            request,
            new AbortController().signal,
            () => {},
        ),
        /does not expose the Responses API/,
    );
    assert.equal(mocked.mock.callCount(), 1);
});

test("GGUF validation requires a complete shard set and correct magic", async () => {
    const file = (name: string, text = "GGUF1234") => new File([text], name);
    assert.equal((await validateModelFiles([file("model.gguf")])).length, 1);
    const shards = [file("model-00002-of-00002.gguf"), file("model-00001-of-00002.gguf")];
    assert.equal((await validateModelFiles(shards))[0].name, "model-00001-of-00002.gguf");
    await assert.rejects(validateModelFiles([shards[0]]), /every numbered/);
    await assert.rejects(
        validateModelFiles([file("a.gguf"), file("b.gguf")]),
        /one model at a time/,
    );
    await assert.rejects(validateModelFiles([file("bad.gguf", "not gguf")]), /not a valid GGUF/);
});
