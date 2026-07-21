import { beforeEach, describe, expect, it } from "@jest/globals";

import useSubscriptionStatusStore from "@/stores/subscriptionStatusStore";

describe("subscription status store", () => {
    beforeEach(() => {
        useSubscriptionStatusStore.setState({
            userId: null,
            hasActiveSubscription: false,
        });
    });

    it("resets entitlement while a different user is being resolved", () => {
        const store = useSubscriptionStatusStore.getState();

        store.setCurrentUser("user-a");
        expect(store.setForUser("user-a", true)).toBe(true);
        expect(useSubscriptionStatusStore.getState().hasActiveSubscription).toBe(true);

        store.setCurrentUser("user-b");
        expect(useSubscriptionStatusStore.getState()).toMatchObject({
            userId: "user-b",
            hasActiveSubscription: null,
        });
    });

    it("rejects a stale result from the previous user", () => {
        const store = useSubscriptionStatusStore.getState();

        store.setCurrentUser("user-b");
        expect(store.setForUser("user-a", true)).toBe(false);
        expect(useSubscriptionStatusStore.getState()).toMatchObject({
            userId: "user-b",
            hasActiveSubscription: null,
        });
    });
});
