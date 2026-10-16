import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getFunctionAddress } from "convex/server";
import { components } from "../_generated/api";
import { handleSapopinguinoRequest } from "../model/sapopinguino/respellHttp";
import { handleSapopinguinoTranslateRequest } from "../model/sapopinguino/translateHttp";
import { STREAM_END_MARKER, STREAM_ERROR_MARKER } from "../constants/sapopinguino";

// Keep request preparation, provider parsing, output encoding and quota orchestration real.
// Only external subscription reconciliation, database RPCs and provider HTTP are replaced.
jest.mock("../model/subscriptions/workers", () => ({
    reconcileSubscriptionStateForUsage: jest.fn(async () => ({ status: "fresh" })),
}));

const refs = components.subscriptions.webhook as Record<string, unknown>;
const address = (ref: unknown) => JSON.stringify(getFunctionAddress(ref as never));
const originalEnv = process.env;
const input = "Hi 😄";

type Operation = "respell" | "translate";
const delta = (operation: Operation, text: string) => operation === "respell"
    ? { type: "response.output_text.delta", delta: text }
    : { choices: [{ index: 0, delta: { content: text }, finish_reason: null }] };
const completed = (operation: Operation) => operation === "respell"
    ? { type: "response.completed" }
    : { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] };
const failed = (operation: Operation) => operation === "respell"
    ? { type: "response.incomplete" }
    : { choices: [{ index: 0, delta: {}, finish_reason: "length" }] };
const output = (operation: Operation) => operation === "respell"
    ? '{"tokens":[["word","Hi","Jai"],["whitespace"," "],["punctuation","😄"]]}'
    : "Hola 😄";

function provider(events: unknown[], status = 200) {
    return jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
        events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { status },
    ));
}

function context(options: { blocked?: string; chargeStatus?: string } = {}) {
    const calls: string[] = [];
    const runMutation = jest.fn(async (ref: unknown, args: Record<string, unknown>) => {
        const operation = ["reserveSubscriptionQuotaUsage", "chargeSubscriptionQuotaUsage", "completeSubscriptionQuotaUsage", "markSubscriptionQuotaUsageFailed"]
            .find(key => address(refs[key]) === address(ref));
        if (!operation) throw new Error("Unexpected quota mutation");
        calls.push(operation);
        if (operation === "reserveSubscriptionQuotaUsage") {
            return options.blocked ? { allowed: false, reason: options.blocked } : { allowed: true, usage_event_id: "usage_1" };
        }
        expect(args.usage_event_id).toBe("usage_1");
        if (operation === "chargeSubscriptionQuotaUsage") return { status: options.chargeStatus ?? "charged" };
        return { status: operation === "completeSubscriptionQuotaUsage" ? "completed" : "failed" };
    });
    return { runMutation, calls };
}

async function request(operation: Operation, ctx: ReturnType<typeof context>, signal?: AbortSignal, options: { translateThenRespell?: unknown; inputLanguage?: string; respellLanguage?: unknown } = {}) {
    const handler = operation === "respell" ? handleSapopinguinoRequest : handleSapopinguinoTranslateRequest;
    return handler(ctx as never, new Request("https://example.test", {
        method: "POST", signal,
        body: JSON.stringify({
            input: JSON.stringify({ input_language: options.inputLanguage ?? "English", target_language: "Spanish", input }),
            streamId: "stream_1",
            translateThenRespell: options.translateThenRespell,
            respellLanguage: options.respellLanguage,
        }),
    }), { userId: "user_1", user: { createdAt: 1000 } } as never);
}

beforeEach(() => {
    process.env = { ...originalEnv, CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_AI_GATEWAY_ID: "gateway", CLOUDFLARE_API_TOKEN: "test-token" };
    jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { process.env = originalEnv; jest.restoreAllMocks(); });

describe.each<Operation>(["respell", "translate"])("%s Cloudflare HTTP quota integration", operation => {
    it("reserves only input characters, charges once across many deltas, and completes", async () => {
        const text = output(operation);
        provider([...Array.from(text, character => delta(operation, character)), completed(operation)]);
        const ctx = context();
        const response = await request(operation, ctx);
        const body = await response.text();
        expect(response.status).toBe(200);
        expect(body).toContain(STREAM_END_MARKER);
        expect(body).not.toContain(STREAM_ERROR_MARKER);
        expect(ctx.calls).toEqual(["reserveSubscriptionQuotaUsage", "chargeSubscriptionQuotaUsage", "completeSubscriptionQuotaUsage"]);
        expect(ctx.runMutation.mock.calls[0][1]).toMatchObject({ operation, req_id: `${operation}:stream_1`, input_char_count: 4 });
        if (operation === "respell") {
            expect(body.split("\n").slice(0, 3).map(line => JSON.parse(line))).toEqual([
                { type: "word", input: "Hi", output: "Jai" }, { type: "whitespace", value: " " }, { type: "punctuation", value: "😄" },
            ]);
        } else {
            expect(response.headers.get("Content-Type")).toContain("text/event-stream");
            expect(body).toContain("event: token");
            expect(body).toContain("event: done");
        }
    });

    it.each([400, 401, 429, 500])("releases without charging on upstream HTTP %i", async status => {
        provider([], status);
        const ctx = context();
        const body = await (await request(operation, ctx)).text();
        expect(body).toContain(STREAM_ERROR_MARKER);
        expect(ctx.calls).toEqual(["reserveSubscriptionQuotaUsage", "markSubscriptionQuotaUsageFailed"]);
    });

    it("releases without charging when credentials are missing", async () => {
        delete process.env.CLOUDFLARE_API_TOKEN;
        const fetchMock = provider([]);
        const ctx = context();
        await (await request(operation, ctx)).text();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(ctx.calls).toEqual(["reserveSubscriptionQuotaUsage", "markSubscriptionQuotaUsageFailed"]);
    });

    it("does not charge a successful but empty provider response", async () => {
        provider([completed(operation)]);
        const ctx = context();
        const body = await (await request(operation, ctx)).text();
        expect(body).toContain(STREAM_ERROR_MARKER);
        expect(ctx.calls).toEqual(["reserveSubscriptionQuotaUsage", "markSubscriptionQuotaUsageFailed"]);
    });

    it("retains one charge and reports failure after partial output", async () => {
        provider([delta(operation, output(operation)), failed(operation)]);
        const ctx = context();
        const body = await (await request(operation, ctx)).text();
        expect(body).toContain(STREAM_ERROR_MARKER);
        expect(body).not.toContain(STREAM_END_MARKER);
        expect(ctx.calls).toEqual(["reserveSubscriptionQuotaUsage", "chargeSubscriptionQuotaUsage", "markSubscriptionQuotaUsageFailed"]);
    });

    it("does not send output when quota charging is rejected", async () => {
        provider([delta(operation, output(operation)), completed(operation)]);
        const ctx = context({ chargeStatus: "invalid_state" });
        const body = await (await request(operation, ctx)).text();
        expect(body).toContain(STREAM_ERROR_MARKER);
        expect(body).not.toContain(STREAM_END_MARKER);
        expect(body).not.toContain(operation === "respell" ? '"type":"word"' : "event: token");
        expect(ctx.calls).toEqual(["reserveSubscriptionQuotaUsage", "chargeSubscriptionQuotaUsage", "markSubscriptionQuotaUsageFailed"]);
    });

    it("releases without charging when cancelled before output", async () => {
        const abort = new AbortController();
        let started!: () => void;
        const ready = new Promise<void>(resolve => { started = resolve; });
        jest.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => new Response(new ReadableStream({
            start(controller) {
                init?.signal?.addEventListener("abort", () => controller.error(Object.assign(new Error("aborted"), { name: "AbortError" })));
                started();
            },
        })));
        const ctx = context();
        const response = await request(operation, ctx, abort.signal);
        const body = response.text();
        await ready;
        abort.abort();
        await body;
        expect(ctx.calls).toEqual(["reserveSubscriptionQuotaUsage", "markSubscriptionQuotaUsageFailed"]);
    });

    it("does not charge reasoning-only output", async () => {
        provider([operation === "respell"
            ? { type: "response.reasoning_summary_text.delta", delta: "private" }
            : { choices: [{ index: 0, delta: { reasoning_content: "private" } }] }, completed(operation)]);
        const ctx = context();
        const body = await (await request(operation, ctx)).text();
        expect(body).not.toContain("private");
        expect(ctx.calls).toEqual(["reserveSubscriptionQuotaUsage", "markSubscriptionQuotaUsageFailed"]);
    });

    it.each(["monthly_limit_exceeded", "input_limit_exceeded", "request_rate_limited", "duplicate_req_id"])("blocks %s before calling Cloudflare", async reason => {
        const fetchMock = provider([]);
        const ctx = context({ blocked: reason });
        const response = await request(operation, ctx);
        expect(response.status).toBe(reason === "duplicate_req_id" ? 409 : 429);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(ctx.calls).toEqual(["reserveSubscriptionQuotaUsage"]);
    });
});


describe("translate then respell HTTP pipeline", () => {
    function providerResponse(events: unknown[]) {
        return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""));
    }

    it("translates first, reverses languages, and charges one respelling request", async () => {
        const fetchMock = jest.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(providerResponse([
                delta("respell", "Hola"), delta("respell", " 😄"), completed("respell"),
            ]))
            .mockResolvedValueOnce(providerResponse([
                delta("respell", '{"tokens":[["word","Hola","oh-lah"],["whitespace"," "],["punctuation","😄"]]}'),
                completed("respell"),
            ]));
        const ctx = context();
        const response = await request("respell", ctx, undefined, { translateThenRespell: true });
        const body = await response.text();

        expect(fetchMock).toHaveBeenCalledTimes(2);
        const translateBody = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
        expect(JSON.parse(translateBody.input)).toEqual({
            input_language: "English", target_language: "Spanish", input,
        });
        const respellBody = JSON.parse(fetchMock.mock.calls[1][1]!.body as string);
        expect(JSON.parse(respellBody.input)).toEqual({
            input_language: "Spanish", target_language: "English", input: "Hola 😄",
        });
        expect(body).toContain('"input":"Hola","output":"oh-lah"');
        expect(body).toContain(STREAM_END_MARKER);
        expect(ctx.calls).toEqual([
            "reserveSubscriptionQuotaUsage", "chargeSubscriptionQuotaUsage", "completeSubscriptionQuotaUsage",
        ]);
        expect(ctx.runMutation.mock.calls[0][1]).toMatchObject({
            operation: "respell", input_char_count: 4,
        });
    });

    it.each([
        [failed("respell")],
        [completed("respell")],
        [delta("respell", "partial"), failed("respell")],
        [delta("respell", "x".repeat(65_537)), completed("respell")],
    ])("does not respell or charge a failed, empty, or oversized translation (%#)", async (...events) => {
        const fetchMock = provider(events);
        const ctx = context();
        const body = await (await request("respell", ctx, undefined, { translateThenRespell: true })).text();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(body).toContain(STREAM_ERROR_MARKER);
        expect(body).not.toContain(STREAM_END_MARKER);
        expect(ctx.calls).toEqual(["reserveSubscriptionQuotaUsage", "markSubscriptionQuotaUsageFailed"]);
    });

    it.each([
        { translateThenRespell: "true" },
        { translateThenRespell: true, respellLanguage: "Auto-detect" },
    ])("rejects invalid mode options before reserving quota", async options => {
        const fetchMock = provider([]);
        const ctx = context();
        expect((await request("respell", ctx, undefined, options)).status).toBe(400);
        expect(ctx.calls).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects the mode on the translation endpoint", async () => {
        const ctx = context();
        expect((await request("translate", ctx, undefined, { translateThenRespell: true })).status).toBe(400);
        expect(ctx.calls).toEqual([]);
    });

    it("cancels during translation without starting respelling or charging", async () => {
        const fetchMock = jest.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
            return new Promise<Response>((_resolve, reject) => {
                init!.signal!.addEventListener("abort", () => {
                    const error = new Error("Aborted");
                    error.name = "AbortError";
                    reject(error);
                }, { once: true });
            });
        });
        const ctx = context();
        const controller = new AbortController();
        const response = await request("respell", ctx, controller.signal, { translateThenRespell: true });
        controller.abort();
        await response.text();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(ctx.calls).toEqual(["reserveSubscriptionQuotaUsage", "markSubscriptionQuotaUsageFailed"]);
    });

    it.each([
        { inputLanguage: "Auto-detect", respellLanguage: "Source", detected: true, expected: "English" },
        { inputLanguage: "Auto-detect", respellLanguage: "French", detected: false, expected: "French" },
        { inputLanguage: "English", respellLanguage: "French", detected: false, expected: "French" },
    ])("resolves the respelling language and streams preview before respelling: %j", async options => {
        const translation = 'Hola "amigo" 😄';
        const raw = options.detected ? JSON.stringify({ detectedSourceLanguage: "English", translation }) : translation;
        const fetchMock = jest.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(providerResponse([...raw].map(c => delta("respell", c)).concat([completed("respell") as never])))
            .mockResolvedValueOnce(providerResponse([delta("respell", output("respell")), completed("respell")]));
        const ctx = context();
        const body = await (await request("respell", ctx, undefined, { translateThenRespell: true, ...options })).text();
        const first = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
        expect(first.model).toBe("gpt-6-luna");
        expect(Boolean(first.text?.format)).toBe(options.detected);
        expect(JSON.parse(JSON.parse(fetchMock.mock.calls[1][1]!.body as string).input)).toEqual({
            input_language: "Spanish", target_language: options.expected, input: translation,
        });
        const lines = body.split("\n").filter(line => line.startsWith("{" )).map(line => JSON.parse(line));
        expect(lines.filter(line => line.type === "translation_preview").map(line => line.value).join("")).toBe(translation);
        expect(lines.findIndex(line => line.type === "respell_start")).toBeGreaterThan(0);
        expect(body).toContain(STREAM_END_MARKER);
    });

    it.each([
        ['{"detectedSourceLanguage":"Unknown","translation":"Hola"}', true],
        ['{"detectedSourceLanguage":"Klingon","translation":"Hola"}', true],
        ['{"detectedSourceLanguage":"English","translation":"Hola"', true],
        ['{"detectedSourceLanguage":"English","translation":"Hola"}', false],
    ])("never starts respelling on invalid or unfinished structured output", async (raw, complete) => {
        const fetchMock = provider([delta("respell", raw as string), ...(complete ? [completed("respell")] : [])]);
        const ctx = context();
        const body = await (await request("respell", ctx, undefined, { translateThenRespell: true, inputLanguage: "Auto-detect" })).text();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(body).toContain(STREAM_ERROR_MARKER);
        expect(body).not.toContain('"type":"respell_start"');
        expect(ctx.calls).not.toContain("chargeSubscriptionQuotaUsage");
    });

    it("keeps the disabled mode as a single respelling call", async () => {
        const fetchMock = provider([delta("respell", output("respell")), completed("respell")]);
        const ctx = context();
        const body = await (await request("respell", ctx, undefined, { translateThenRespell: false })).text();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(body).toContain(STREAM_END_MARKER);
    });
});
