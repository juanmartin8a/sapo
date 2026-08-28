import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { handleSubscriptionReconciliationRequest } from "../model/http/subscriptionReconciliation";
import * as subscriptionWorkers from "../model/subscriptions/workers";
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

    it("bypasses a fresh free state when the SDK observes active", () => {
        expect(
            shouldUseExistingStateForObservedSubscription(
                subscriptionState(),
                10_000,
                true
            )
        ).toBe(false);
    });

    it("preserves recently confirmed unexpired access when the SDK observes inactive", () => {
        expect(
            shouldUseExistingStateForObservedSubscription(
                subscriptionState({
                    plan_key: "polyglot",
                    has_active_subscription: true,
                    access_expires_at_ms: 15_000,
                }),
                10_000,
                false
            )
        ).toBe(true);
    });

    it("revalidates an inactive SDK observation after confirmed access expires", () => {
        expect(
            shouldUseExistingStateForObservedSubscription(
                subscriptionState({
                    plan_key: "polyglot",
                    has_active_subscription: true,
                    access_expires_at_ms: 10_000,
                }),
                10_000,
                false
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

    it("keeps matching client state fresh through RevenueCat access expiration", () => {
        expect(
            shouldUseExistingStateForObservedSubscription(
                subscriptionState({
                    plan_key: "polyglot",
                    has_active_subscription: true,
                    billing_cycle_end_at_ms: 8_000,
                    access_expires_at_ms: 15_000,
                }),
                10_000,
                true
            )
        ).toBe(true);
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

    it("returns fresh active access when the SDK briefly observes inactive", async () => {
        jest.spyOn(Date, "now").mockReturnValue(10_000);
        let queryCount = 0;
        const ctx = {
            runQuery: jest.fn(async () => {
                queryCount += 1;
                return queryCount === 1
                    ? subscriptionState({
                          plan_key: "polyglot",
                          has_active_subscription: true,
                          access_expires_at_ms: 15_000,
                      })
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
            status: "active",
            subscription: { has_active_subscription: true, plan_key: "polyglot" },
        });
        expect(ctx.runMutation).not.toHaveBeenCalled();
    });

    it("preserves confirmed active access while reconciliation is pending", async () => {
        jest.spyOn(subscriptionWorkers, "reconcileObservedSubscriptionStateHandler")
            .mockResolvedValue({
                status: "pending_active",
                revenuecat_app_user_id: "user_1",
                plan_key: "polyglot",
                has_active_subscription: true,
                last_synced_at_ms: 9_000,
                pending_active_expires_at_ms: 15_000,
                pending_active_signal_at_ms: 8_000,
            });

        const response = await handleSubscriptionReconciliationRequest(
            {} as any,
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
            status: "active",
            subscription: { has_active_subscription: true, plan_key: "polyglot" },
        });
    });

    it("keeps activation pending when the SDK later observes inactive", async () => {
        jest.spyOn(subscriptionWorkers, "reconcileObservedSubscriptionStateHandler")
            .mockResolvedValue({
                status: "pending_active",
                revenuecat_app_user_id: "user_1",
                plan_key: "free",
                has_active_subscription: false,
                last_synced_at_ms: 9_000,
                pending_active_expires_at_ms: 15_000,
                pending_active_signal_at_ms: 8_000,
            });

        const response = await handleSubscriptionReconciliationRequest(
            {} as any,
            new Request("https://example.test/subscription/reconcile", {
                method: "POST",
                body: JSON.stringify({
                    expected_user_id: "user_1",
                    observed_active: false,
                }),
            }),
            { userId: "user_1", user: {} } as any
        );

        expect(response.status).toBe(202);
        await expect(response.json()).resolves.toMatchObject({
            ok: true,
            status: "activating",
            subscription: { has_active_subscription: false, plan_key: "free" },
        });
    });
});
