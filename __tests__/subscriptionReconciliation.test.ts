import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { handleSubscriptionReconciliationRequest } from "../model/http/subscriptionReconciliation";
import { shouldUseExistingStateForObservedSubscription } from "../model/subscriptions/workers";
import type { CurrentSubscriptionState } from "../model/subscriptions/revenueCatApi";

const originalEnv = process.env;

function subscriptionState(
    overrides: Partial<CurrentSubscriptionState> = {}
): CurrentSubscriptionState {
    return {
        user_id: "user_1",
        revenuecat_app_user_id: "user_1",
        plan_key: "free",
        has_active_subscription: false,
        last_synced_at_ms: 9_000,
        stale_after_at_ms: 20_000,
        ...overrides,
    };
}

describe("observed subscription reconciliation", () => {
    afterEach(() => {
        process.env = originalEnv;
        jest.restoreAllMocks();
    });

    it("uses a fresh matching state without RevenueCat reconciliation", () => {
        expect(
            shouldUseExistingStateForObservedSubscription(
                subscriptionState(),
                10_000,
                false
            )
        ).toBe(true);
    });

    it("bypasses freshness when the SDK and backend disagree", () => {
        expect(
            shouldUseExistingStateForObservedSubscription(
                subscriptionState(),
                10_000,
                true
            )
        ).toBe(false);
    });

    it("bypasses freshness while activation is pending", () => {
        expect(
            shouldUseExistingStateForObservedSubscription(
                subscriptionState({ pending_active_expires_at_ms: 15_000 }),
                10_000,
                false
            )
        ).toBe(false);
    });

    it("requires a POST body with the authenticated user and SDK observation", async () => {
        const ctx = { runQuery: jest.fn(), runMutation: jest.fn() };
        const auth = { userId: "user_1", user: {} };

        const missingObservation = await handleSubscriptionReconciliationRequest(
            ctx as any,
            new Request("https://example.test/subscription/reconcile", {
                method: "POST",
                body: JSON.stringify({ expected_user_id: "user_1" }),
            }),
            auth as any
        );
        expect(missingObservation.status).toBe(400);

        const mismatchedUser = await handleSubscriptionReconciliationRequest(
            ctx as any,
            new Request("https://example.test/subscription/reconcile", {
                method: "POST",
                body: JSON.stringify({
                    expected_user_id: "user_2",
                    observed_active: true,
                }),
            }),
            auth as any
        );
        expect(mismatchedUser.status).toBe(409);
        expect(ctx.runQuery).not.toHaveBeenCalled();
    });

    it("returns a fresh matching backend state without a mutation", async () => {
        jest.spyOn(Date, "now").mockReturnValue(10_000);
        let queryCount = 0;
        const ctx = {
            runQuery: jest.fn(async () => {
                queryCount += 1;
                return queryCount === 1
                    ? subscriptionState()
                    : { in_progress: false, blocks_revenuecat_reconciliation: false };
            }),
            runMutation: jest.fn(),
        };
        const response = await handleSubscriptionReconciliationRequest(
            ctx as any,
            new Request("https://example.test/subscription/reconcile", {
                method: "POST",
                body: JSON.stringify({
                    expected_user_id: "user_1",
                    observed_active: false,
                }),
            }),
            { userId: "user_1", user: {} } as any
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            ok: true,
            status: "inactive",
            subscription: { has_active_subscription: false, plan_key: "free" },
        });
        expect(ctx.runMutation).not.toHaveBeenCalled();
    });
});
