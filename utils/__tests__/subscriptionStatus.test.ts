import { describe, expect, it } from "@jest/globals";

import { getEffectiveSubscriptionStatus } from "@/utils/subscription";

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

    it("keeps auth and account transitions unresolved", () => {
        expect(getEffectiveSubscriptionStatus({
            ...activeUser,
            authStatus: "checking",
            userId: null,
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
