import { beforeEach, describe, expect, it } from "@jest/globals";

import useSubscriptionStatusStore from "@/stores/subscriptionStatusStore";

describe("subscription status store", () => {
    beforeEach(() => {
        useSubscriptionStatusStore.setState({
            userId: null,
            status: "inactive",
            hasActiveSubscription: false,
        });
    });

    it("resets entitlement while a different user is being resolved", () => {
        const store = useSubscriptionStatusStore.getState();

        store.setCurrentUser("user-a");
        expect(store.setForUser("user-a", "active")).toBe(true);
        expect(useSubscriptionStatusStore.getState().hasActiveSubscription).toBe(true);

        store.setCurrentUser("user-b");
        expect(useSubscriptionStatusStore.getState()).toMatchObject({
            userId: "user-b",
            status: "checking",
            hasActiveSubscription: null,
        });
    });

    it("rejects a stale result from the previous user", () => {
        const store = useSubscriptionStatusStore.getState();

        store.setCurrentUser("user-b");
        expect(store.setForUser("user-a", "active")).toBe(false);
        expect(useSubscriptionStatusStore.getState()).toMatchObject({
            userId: "user-b",
            status: "checking",
            hasActiveSubscription: null,
        });
    });

    it("keeps the last confirmed free state while activation is pending", () => {
        const store = useSubscriptionStatusStore.getState();

        store.setCurrentUser("user-a");
        store.setForUser("user-a", "inactive");
        store.setForUser("user-a", "activating");
        expect(useSubscriptionStatusStore.getState()).toMatchObject({
            status: "activating",
            hasActiveSubscription: false,
        });

        store.setForUser("user-a", "active");
        expect(useSubscriptionStatusStore.getState()).toMatchObject({
            status: "active",
            hasActiveSubscription: true,
        });
    });

    it("keeps the last confirmed paid state while a result is pending", () => {
        const store = useSubscriptionStatusStore.getState();

        store.setCurrentUser("user-a");
        store.setForUser("user-a", "active");
        store.setForUser("user-a", "activating");

        expect(useSubscriptionStatusStore.getState()).toMatchObject({
            status: "activating",
            hasActiveSubscription: true,
        });
    });

    it("keeps an unresolved new user neutral", () => {
        const store = useSubscriptionStatusStore.getState();

        store.setCurrentUser("user-a");
        store.setForUser("user-a", "activating");

        expect(useSubscriptionStatusStore.getState()).toMatchObject({
            status: "activating",
            hasActiveSubscription: null,
        });
    });
});
