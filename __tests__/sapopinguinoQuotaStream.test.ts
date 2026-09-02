import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { getFunctionAddress } from "convex/server";

import { components } from "../_generated/api";
import { createSapopinguinoQuotaStream } from "../model/sapopinguino/quotaStream";

const subscriptionsWebhook = components.subscriptions.webhook as Record<string, unknown>;

async function drainStream(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader();

    while (!(await reader.read()).done) {
        // The lifecycle behavior is independent of endpoint-specific output.
    }
}

function createContext(...statuses: string[]) {
    return {
        runMutation: jest.fn(async (_reference: unknown, _args: Record<string, unknown>) => ({
            status: statuses.shift(),
        })),
    };
}

function expectFunctionReference(actual: unknown, expected: unknown) {
    expect(getFunctionAddress(actual as any)).toEqual(getFunctionAddress(expected as any));
}

describe("Sapopinguino quota stream lifecycle", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("charges on first output and completes exactly once", async () => {
        const ctx = createContext("charged", "completed");
        const onUnexpectedError = jest.fn();
        const stream = createSapopinguinoQuotaStream(
            ctx as any,
            new Request("https://example.test"),
            {
                usage_event_id: "usage_1" as any,
                log_context: "test stream",
                run: async ({ ensureQuotaCharged, hasChargedQuota }) => {
                    expect(await ensureQuotaCharged()).toBe(true);
                    expect(await ensureQuotaCharged()).toBe(true);
                    expect(hasChargedQuota()).toBe(true);
                    return "completed";
                },
                on_unexpected_error: onUnexpectedError,
            }
        );

        await drainStream(stream);

        expect(ctx.runMutation).toHaveBeenCalledTimes(2);
        expectFunctionReference(
            ctx.runMutation.mock.calls[0][0],
            subscriptionsWebhook.chargeSubscriptionQuotaUsage
        );
        expectFunctionReference(
            ctx.runMutation.mock.calls[1][0],
            subscriptionsWebhook.completeSubscriptionQuotaUsage
        );
        expect(ctx.runMutation.mock.calls[1][1]).toMatchObject({ usage_event_id: "usage_1" });
        expect(onUnexpectedError).not.toHaveBeenCalled();
    });

    it("fails a completed stream that never produced chargeable output", async () => {
        const ctx = createContext("failed");
        const stream = createSapopinguinoQuotaStream(
            ctx as any,
            new Request("https://example.test"),
            {
                usage_event_id: "usage_1" as any,
                log_context: "test stream",
                run: async () => "completed",
                on_unexpected_error: jest.fn(),
            }
        );

        await drainStream(stream);

        expect(ctx.runMutation).toHaveBeenCalledTimes(1);
        expectFunctionReference(
            ctx.runMutation.mock.calls[0][0],
            subscriptionsWebhook.markSubscriptionQuotaUsageFailed
        );
    });

    it("fails the reservation when charging is rejected", async () => {
        jest.spyOn(console, "error").mockImplementation(() => undefined);
        const ctx = createContext("released", "failed");
        const stream = createSapopinguinoQuotaStream(
            ctx as any,
            new Request("https://example.test"),
            {
                usage_event_id: "usage_1" as any,
                log_context: "test stream",
                run: async ({ ensureQuotaCharged }) =>
                    (await ensureQuotaCharged()) ? "completed" : "errored",
                on_unexpected_error: jest.fn(),
            }
        );

        await drainStream(stream);

        expect(ctx.runMutation).toHaveBeenCalledTimes(2);
        expectFunctionReference(
            ctx.runMutation.mock.calls[0][0],
            subscriptionsWebhook.chargeSubscriptionQuotaUsage
        );
        expectFunctionReference(
            ctx.runMutation.mock.calls[1][0],
            subscriptionsWebhook.markSubscriptionQuotaUsageFailed
        );
    });

    it("fails on unexpected errors and emits an error response", async () => {
        const ctx = createContext("failed");
        const onUnexpectedError = jest.fn();
        const stream = createSapopinguinoQuotaStream(
            ctx as any,
            new Request("https://example.test"),
            {
                usage_event_id: "usage_1" as any,
                log_context: "test stream",
                run: async () => {
                    throw new Error("stream failed");
                },
                on_unexpected_error: onUnexpectedError,
            }
        );

        await drainStream(stream);

        expect(ctx.runMutation).toHaveBeenCalledTimes(1);
        expectFunctionReference(
            ctx.runMutation.mock.calls[0][0],
            subscriptionsWebhook.markSubscriptionQuotaUsageFailed
        );
        expect(onUnexpectedError).toHaveBeenCalledTimes(1);
    });

    it("propagates request cancellation upstream and fails without emitting an error", async () => {
        const requestAbort = new AbortController();
        const ctx = createContext("failed");
        const onUnexpectedError = jest.fn();
        const stream = createSapopinguinoQuotaStream(
            ctx as any,
            new Request("https://example.test", { signal: requestAbort.signal }),
            {
                usage_event_id: "usage_1" as any,
                log_context: "test stream",
                run: ({ upstream }) =>
                    new Promise((_, reject) => {
                        upstream.signal.addEventListener("abort", () => {
                            const error = new Error("aborted");
                            error.name = "AbortError";
                            reject(error);
                        });
                    }),
                on_unexpected_error: onUnexpectedError,
            }
        );

        requestAbort.abort();
        await drainStream(stream);

        expect(ctx.runMutation).toHaveBeenCalledTimes(1);
        expectFunctionReference(
            ctx.runMutation.mock.calls[0][0],
            subscriptionsWebhook.markSubscriptionQuotaUsageFailed
        );
        expect(onUnexpectedError).not.toHaveBeenCalled();
    });
});
