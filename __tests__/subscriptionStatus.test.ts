import { describe, expect, it, jest } from "@jest/globals";
import { SUBSCRIPTION_PLAN_KEYS } from "../constants/subscriptions";
import { resolveCurrentSubscriptionStatus } from "../model/subscription";

jest.mock("../betterAuth/auth", () => ({ authComponent: {} }));
jest.mock("../model/subscriptions/componentApi", () => ({
    getSubscriptionStateByUserId: jest.fn(),
}));

describe("current subscription status", () => {
    it("reports unexpired paid access as active", () => {
        expect(
            resolveCurrentSubscriptionStatus(
                {
                    has_active_subscription: true,
                    access_expires_at_ms: 6_000,
                    pending_active_expires_at_ms: undefined,
                    plan_key: SUBSCRIPTION_PLAN_KEYS.POLYGLOT,
                },
                5_000
            )
        ).toEqual({
            status: "active",
            has_active_subscription: true,
            plan_key: SUBSCRIPTION_PLAN_KEYS.POLYGLOT,
        });
    });

    it("does not report an expired paid period as activating", () => {
        expect(
            resolveCurrentSubscriptionStatus(
                {
                    has_active_subscription: true,
                    access_expires_at_ms: 5_000,
                    pending_active_expires_at_ms: 6_000,
                    plan_key: SUBSCRIPTION_PLAN_KEYS.POLYGLOT,
                },
                5_000
            )
        ).toEqual({
            status: "inactive",
            has_active_subscription: false,
            plan_key: SUBSCRIPTION_PLAN_KEYS.FREE,
        });
    });

    it("reports a pending first activation as activating", () => {
        expect(
            resolveCurrentSubscriptionStatus(
                {
                    has_active_subscription: false,
                    pending_active_expires_at_ms: 6_000,
                    plan_key: SUBSCRIPTION_PLAN_KEYS.FREE,
                },
                5_000
            )
        ).toEqual({
            status: "activating",
            has_active_subscription: false,
            plan_key: SUBSCRIPTION_PLAN_KEYS.FREE,
        });
    });

    it("reports inactive after reconciliation persists revoked access", () => {
        expect(
            resolveCurrentSubscriptionStatus(
                {
                    has_active_subscription: false,
                    pending_active_expires_at_ms: undefined,
                    plan_key: SUBSCRIPTION_PLAN_KEYS.POLYGLOT,
                },
                5_000
            )
        ).toEqual({
            status: "inactive",
            has_active_subscription: false,
            plan_key: SUBSCRIPTION_PLAN_KEYS.FREE,
        });
    });
});
