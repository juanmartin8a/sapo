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

async function request(operation: Operation, ctx: ReturnType<typeof context>, signal?: AbortSignal) {
    const handler = operation === "respell" ? handleSapopinguinoRequest : handleSapopinguinoTranslateRequest;
    return handler(ctx as never, new Request("https://example.test", {
        method: "POST", signal,
        body: JSON.stringify({
            input: JSON.stringify({ input_language: "English", target_language: "Spanish", input }),
            streamId: "stream_1",
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
