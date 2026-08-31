import { describe, expect, it } from "@jest/globals";

import {
    getEffectiveSubscriptionStatus,
    isSubscriptionConfirmedInactive,
} from "@/utils/subscription";

describe("effective subscription status", () => {
    const activeUser = {
        authStatus: "authenticated" as const,
        userId: "user-a",
        subscriptionUserId: "user-a",
        hasActiveSubscription: true,
    };

    it("keeps an authenticated user's confirmed status", () => {
        expect(getEffectiveSubscriptionStatus(activeUser)).toBe(true);
        expect(getEffectiveSubscriptionStatus({
            ...activeUser,
            hasActiveSubscription: false,
        })).toBe(false);
    });

    it("keeps the last confirmed status while auth is being verified", () => {
        expect(getEffectiveSubscriptionStatus({
            ...activeUser,
            authStatus: "checking",
        })).toBe(true);
        expect(getEffectiveSubscriptionStatus({
            ...activeUser,
            authStatus: "checking",
            hasActiveSubscription: false,
        })).toBe(false);
    });

    it("keeps cold starts and account transitions unresolved", () => {
        expect(getEffectiveSubscriptionStatus({
            ...activeUser,
            authStatus: "checking",
            userId: null,
            subscriptionUserId: null,
            hasActiveSubscription: null,
        })).toBeNull();
        expect(getEffectiveSubscriptionStatus({
            ...activeUser,
            authStatus: "checking",
            userId: "user-b",
        })).toBeNull();
        expect(getEffectiveSubscriptionStatus({
            ...activeUser,
            subscriptionUserId: "user-b",
        })).toBeNull();
    });

    it("revokes access only after confirmed sign-out", () => {
        expect(getEffectiveSubscriptionStatus({
            ...activeUser,
            authStatus: "signed_out",
            userId: null,
        })).toBe(false);
    });
});

describe("confirmed inactive subscription", () => {
    const inactiveUser = {
        authStatus: "authenticated" as const,
        userId: "user-a",
        subscriptionUserId: "user-a",
        subscriptionStatus: "inactive" as const,
    };

    it("requires an authoritative inactive status for the current user", () => {
        expect(isSubscriptionConfirmedInactive(inactiveUser)).toBe(true);
        expect(isSubscriptionConfirmedInactive({
            ...inactiveUser,
            subscriptionStatus: "checking",
        })).toBe(false);
        expect(isSubscriptionConfirmedInactive({
            ...inactiveUser,
            subscriptionStatus: "activating",
        })).toBe(false);
        expect(isSubscriptionConfirmedInactive({
            ...inactiveUser,
            subscriptionStatus: "active",
        })).toBe(false);
    });

    it("does not treat auth or account transitions as subscription loss", () => {
        expect(isSubscriptionConfirmedInactive({
            ...inactiveUser,
            authStatus: "checking",
            userId: null,
        })).toBe(false);
        expect(isSubscriptionConfirmedInactive({
            ...inactiveUser,
            authStatus: "signed_out",
            userId: null,
        })).toBe(false);
        expect(isSubscriptionConfirmedInactive({
            ...inactiveUser,
            subscriptionUserId: "user-b",
        })).toBe(false);
    });
});
