import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { SUBSCRIPTION_PLAN_KEYS } from "@/constants/subscription";
import {
    clearConfirmedSubscriptionSnapshot,
    loadConfirmedSubscriptionSnapshot,
    persistConfirmedSubscriptionSnapshot,
} from "@/lib/confirmed-subscription-cache";
import useSubscriptionStatusStore from "@/stores/subscriptionStatusStore";

jest.mock("@/lib/confirmed-subscription-cache", () => ({
    clearConfirmedSubscriptionSnapshot: jest.fn(() => Promise.resolve()),
    loadConfirmedSubscriptionSnapshot: jest.fn(() => Promise.resolve(null)),
    persistConfirmedSubscriptionSnapshot: jest.fn(() => Promise.resolve()),
}));

const activeSubscription = {
    status: "active" as const,
    planKey: SUBSCRIPTION_PLAN_KEYS.POLYGLOT,
    accessExpiresAtMs: 10_000,
};
const inactiveSubscription = {
    status: "inactive" as const,
    planKey: SUBSCRIPTION_PLAN_KEYS.FREE,
    accessExpiresAtMs: null,
};
const activatingSubscription = {
    status: "activating" as const,
    planKey: SUBSCRIPTION_PLAN_KEYS.FREE,
    accessExpiresAtMs: null,
};

describe("subscription status store", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        useSubscriptionStatusStore.setState({
            userId: null,
            status: "inactive",
            hasActiveSubscription: false,
            planKey: SUBSCRIPTION_PLAN_KEYS.FREE,
            accessExpiresAtMs: null,
        });
    });

    it("resets entitlement while a different user is being resolved", () => {
        const store = useSubscriptionStatusStore.getState();

        store.setCurrentUser("user-a");
        expect(store.applyConvexStatus("user-a", activeSubscription)).toBe(true);
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
        expect(store.applyConvexStatus("user-a", activeSubscription)).toBe(false);
        expect(useSubscriptionStatusStore.getState()).toMatchObject({
            userId: "user-b",
            status: "checking",
            hasActiveSubscription: null,
        });
    });

    it("keeps the last confirmed free state while activation is pending", () => {
        const store = useSubscriptionStatusStore.getState();

        store.setCurrentUser("user-a");
        store.applyConvexStatus("user-a", inactiveSubscription);
        store.applyConvexStatus("user-a", activatingSubscription);
        expect(useSubscriptionStatusStore.getState()).toMatchObject({
            status: "activating",
            hasActiveSubscription: false,
        });

        store.applyConvexStatus("user-a", activeSubscription);
        expect(useSubscriptionStatusStore.getState()).toMatchObject({
            status: "active",
            hasActiveSubscription: true,
        });
    });

    it("keeps the last confirmed paid state while a result is pending", () => {
        const store = useSubscriptionStatusStore.getState();

        store.setCurrentUser("user-a");
        store.applyConvexStatus("user-a", activeSubscription);
        store.applyConvexStatus("user-a", activatingSubscription);

        expect(useSubscriptionStatusStore.getState()).toMatchObject({
            status: "activating",
            hasActiveSubscription: true,
        });
    });

    it("expires paid access only for the current user", () => {
        const store = useSubscriptionStatusStore.getState();

        store.setCurrentUser("user-a");
        store.applyConvexStatus("user-a", activeSubscription);

        store.expireForUser("user-b");
        expect(useSubscriptionStatusStore.getState().hasActiveSubscription).toBe(true);
        expect(clearConfirmedSubscriptionSnapshot).not.toHaveBeenCalled();
        store.expireForUser("user-a");
        expect(useSubscriptionStatusStore.getState()).toMatchObject({
            status: "inactive",
            hasActiveSubscription: false,
        });
        expect(clearConfirmedSubscriptionSnapshot).toHaveBeenCalledTimes(1);
    });

    it("keeps an unresolved new user neutral", () => {
        const store = useSubscriptionStatusStore.getState();

        store.setCurrentUser("user-a");
        store.applyConvexStatus("user-a", activatingSubscription);

        expect(useSubscriptionStatusStore.getState()).toMatchObject({
            status: "activating",
            hasActiveSubscription: null,
        });
    });

    it("hydrates an unexpired confirmed state for the matching unresolved user", async () => {
        jest.mocked(loadConfirmedSubscriptionSnapshot).mockResolvedValueOnce({
            userId: "user-a",
            status: "active",
            planKey: SUBSCRIPTION_PLAN_KEYS.POLYGLOT,
            accessExpiresAtMs: 10_000,
            confirmedAtMs: 5_000,
        });
        const store = useSubscriptionStatusStore.getState();

        store.setCurrentUser("user-a");
        await store.hydrateForUser("user-a");

        expect(useSubscriptionStatusStore.getState()).toMatchObject({
            userId: "user-a",
            status: "active",
            hasActiveSubscription: true,
            planKey: SUBSCRIPTION_PLAN_KEYS.POLYGLOT,
            accessExpiresAtMs: 10_000,
        });
    });

    it("persists settled Convex states but not activating states", () => {
        const store = useSubscriptionStatusStore.getState();

        store.setCurrentUser("user-a");
        store.applyConvexStatus("user-a", activeSubscription);
        expect(persistConfirmedSubscriptionSnapshot).toHaveBeenCalledTimes(1);

        store.applyConvexStatus("user-a", activatingSubscription);
        expect(persistConfirmedSubscriptionSnapshot).toHaveBeenCalledTimes(1);
    });
});
