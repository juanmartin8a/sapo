import { describe, expect, it } from "@jest/globals";

import { resolveSubscriptionAccessExpirationAtMs } from "../model/webhook";

describe("subscription access expiration", () => {
    it("uses RevenueCat active-entitlement expiration during grace", () => {
        expect(
            resolveSubscriptionAccessExpirationAtMs({
                has_active_subscription: true,
                snapshot: {
                    period_start_at_ms: 1_000,
                    period_end_at_ms: 2_000,
                    access_expires_at_ms: 5_000,
                },
            })
        ).toBe(5_000);
    });

    it("preserves known access expiration for the same billing period", () => {
        expect(
            resolveSubscriptionAccessExpirationAtMs({
                has_active_subscription: true,
                snapshot: {
                    period_start_at_ms: 1_000,
                    period_end_at_ms: 2_000,
                },
                existing_state: {
                    has_active_subscription: true,
                    billing_cycle_start_at_ms: 1_000,
                    billing_cycle_end_at_ms: 2_000,
                    access_expires_at_ms: 5_000,
                },
            })
        ).toBe(5_000);
    });

    it("does not carry an old grace deadline into a changed billing period", () => {
        expect(
            resolveSubscriptionAccessExpirationAtMs({
                has_active_subscription: true,
                snapshot: {
                    period_start_at_ms: 2_000,
                    period_end_at_ms: 6_000,
                },
                existing_state: {
                    has_active_subscription: true,
                    billing_cycle_start_at_ms: 1_000,
                    billing_cycle_end_at_ms: 2_000,
                    access_expires_at_ms: 5_000,
                },
            })
        ).toBe(6_000);
    });

    it("clears access expiration when RevenueCat revokes access", () => {
        expect(
            resolveSubscriptionAccessExpirationAtMs({
                has_active_subscription: false,
                snapshot: {},
                existing_state: {
                    has_active_subscription: true,
                    access_expires_at_ms: 5_000,
                },
            })
        ).toBeUndefined();
    });
});
