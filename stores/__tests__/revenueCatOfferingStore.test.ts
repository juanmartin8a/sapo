import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { PurchasesPackage } from "react-native-purchases";

import { getRevenueCatSubscriptionOffering } from "@/lib/revenuecat";
import useRevenueCatOfferingStore from "@/stores/revenueCatOfferingStore";

jest.mock("@/lib/revenuecat", () => ({
    getRevenueCatSubscriptionOffering: jest.fn(),
}));

const mockGetRevenueCatSubscriptionOffering = jest.mocked(
    getRevenueCatSubscriptionOffering
);
const subscriptionPackage = {
    identifier: "$rc_monthly",
    product: { identifier: "polyglot_monthly" },
} as PurchasesPackage;

describe("RevenueCat offering store", () => {
    beforeEach(() => {
        mockGetRevenueCatSubscriptionOffering.mockReset();
        useRevenueCatOfferingStore.getState().clear();
    });

    it("coalesces concurrent loads for the same user", async () => {
        mockGetRevenueCatSubscriptionOffering.mockResolvedValue({
            subscriptionPackage,
            subscriptionProduct: null,
        });

        const firstLoad = useRevenueCatOfferingStore.getState().loadForUser("user-a");
        const secondLoad = useRevenueCatOfferingStore.getState().loadForUser("user-a");

        expect(secondLoad).toBe(firstLoad);
        await firstLoad;
        expect(mockGetRevenueCatSubscriptionOffering).toHaveBeenCalledTimes(1);
        expect(useRevenueCatOfferingStore.getState()).toMatchObject({
            userId: "user-a",
            linkedElsewhereUserId: null,
            status: "ready",
            subscriptionPackage,
        });
    });

    it("tracks receipt conflicts for the affected user only", async () => {
        const store = useRevenueCatOfferingStore.getState();

        store.setLinkedElsewhereUser("user-a");
        expect(useRevenueCatOfferingStore.getState().linkedElsewhereUserId).toBe("user-a");

        mockGetRevenueCatSubscriptionOffering.mockResolvedValue({
            subscriptionPackage,
            subscriptionProduct: null,
        });
        await store.loadForUser("user-b");
        expect(useRevenueCatOfferingStore.getState().linkedElsewhereUserId).toBeNull();
    });

    it("requests an identity resync explicitly", () => {
        const store = useRevenueCatOfferingStore.getState();
        const identitySyncRequestId = store.identitySyncRequestId;

        store.setLinkedElsewhereUser("user-a");
        store.setLinkedElsewhereUser(null);
        expect(useRevenueCatOfferingStore.getState().identitySyncRequestId).toBe(
            identitySyncRequestId
        );

        store.requestIdentitySync();
        expect(useRevenueCatOfferingStore.getState().identitySyncRequestId).toBe(
            identitySyncRequestId + 1
        );
    });

    it("keeps the loaded plan visible while refreshing", async () => {
        mockGetRevenueCatSubscriptionOffering.mockResolvedValue({
            subscriptionPackage,
            subscriptionProduct: null,
        });
        await useRevenueCatOfferingStore.getState().loadForUser("user-a");

        let finishRefresh: (() => void) | undefined;
        mockGetRevenueCatSubscriptionOffering.mockImplementation(
            () => new Promise((resolve) => {
                finishRefresh = () => resolve({
                    subscriptionPackage,
                    subscriptionProduct: null,
                });
            })
        );

        const refresh = useRevenueCatOfferingStore.getState().loadForUser("user-a");
        expect(useRevenueCatOfferingStore.getState()).toMatchObject({
            status: "loading",
            subscriptionPackage,
        });

        finishRefresh?.();
        await refresh;
        expect(useRevenueCatOfferingStore.getState().status).toBe("ready");
    });

    it("clears a previous user's offering when the account changes", async () => {
        mockGetRevenueCatSubscriptionOffering.mockResolvedValue({
            subscriptionPackage,
            subscriptionProduct: null,
        });
        await useRevenueCatOfferingStore.getState().loadForUser("user-a");

        let finishLoad: (() => void) | undefined;
        mockGetRevenueCatSubscriptionOffering.mockImplementation(
            () => new Promise((resolve) => {
                finishLoad = () => resolve({
                    subscriptionPackage: null,
                    subscriptionProduct: null,
                });
            })
        );

        const load = useRevenueCatOfferingStore.getState().loadForUser("user-b");
        expect(useRevenueCatOfferingStore.getState()).toMatchObject({
            userId: "user-b",
            status: "loading",
            subscriptionPackage: null,
        });

        finishLoad?.();
        await load;
    });
});
