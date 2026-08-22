import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { handleSapopinguinoRequest } from "../model/sapopinguino/respellHttp";
import { handleSapopinguinoTranslateRequest } from "../model/sapopinguino/translateHttp";
import type { CurrentSubscriptionState } from "../model/subscriptions/revenueCatApi";

function createSubscriptionState(): CurrentSubscriptionState {
    return {
        user_id: "user_1",
        revenuecat_app_user_id: "rc_user_1",
        plan_key: "free",
        has_active_subscription: false,
        last_synced_at_ms: 1_000,
        stale_after_at_ms: 2_000,
    };
}

function createContendedContext() {
    let stateQueryCount = 0;

    return {
        runQuery: jest.fn(async (_functionRef: unknown, args: Record<string, unknown>) => {
            if (args.model === "user") {
                return { createdAt: 900 };
            }

            if (args.user_id === "user_1") {
                stateQueryCount += 1;
                return stateQueryCount % 2 === 1
                    ? createSubscriptionState()
                    : { blocks_revenuecat_reconciliation: false };
            }

            throw new Error("Unexpected subscription sync query");
        }),
        runMutation: jest.fn(async () => ({
            status: "in_progress",
            revenuecat_app_user_id: "rc_user_1",
            plan_key: "free",
            has_active_subscription: false,
            last_synced_at_ms: 1_000,
            retry_at_ms: 93_000,
        })),
    };
}

function createRequest() {
    return new Request("https://example.com/sapopinguino", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: "hello", streamId: "stream_1" }),
    });
}

describe("Sapopinguino subscription sync contention", () => {
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it.each([
        ["translate", handleSapopinguinoTranslateRequest],
        ["respell", handleSapopinguinoRequest],
    ])("returns retryable 503 for %s after bounded polling", async (_operation, handler) => {
        jest.useFakeTimers();
        jest.spyOn(Date, "now").mockReturnValue(3_000);
        const responsePromise = handler(
            createContendedContext() as any,
            createRequest(),
            { userId: "user_1" } as any
        );

        await jest.advanceTimersByTimeAsync(1_750);
        const response = await responsePromise;

        expect(response.status).toBe(503);
        expect(response.headers.get("Retry-After")).toBe("1");
    });
});
