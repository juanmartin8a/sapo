import { create } from "zustand";
import type { PurchasesPackage, PurchasesStoreProduct } from "react-native-purchases";

import { getRevenueCatSubscriptionOffering } from "@/lib/revenuecat";

type RevenueCatOfferingStatus = "idle" | "loading" | "ready" | "error";

interface RevenueCatOfferingStoreProps {
    userId: string | null;
    linkedElsewhereUserId: string | null;
    identitySyncRequestId: number;
    status: RevenueCatOfferingStatus;
    subscriptionPackage: PurchasesPackage | null;
    subscriptionProduct: PurchasesStoreProduct | null;

    clear: () => void;
    loadForUser: (userId: string | null) => Promise<void>;
    requestIdentitySync: () => void;
    setLinkedElsewhereUser: (userId: string | null) => void;
}

let activeRequest: { userId: string | null; promise: Promise<void> } | null = null;
let latestRequestId = 0;

const useRevenueCatOfferingStore = create<RevenueCatOfferingStoreProps>((set) => ({
    userId: null,
    linkedElsewhereUserId: null,
    identitySyncRequestId: 0,
    status: "idle",
    subscriptionPackage: null,
    subscriptionProduct: null,
    clear: () => {
        latestRequestId += 1;
        activeRequest = null;
        set({
            userId: null,
            linkedElsewhereUserId: null,
            status: "idle",
            subscriptionPackage: null,
            subscriptionProduct: null,
        });
    },
    loadForUser: (userId) => {
        if (activeRequest?.userId === userId) {
            return activeRequest.promise;
        }

        const requestId = ++latestRequestId;
        set((state) => ({
            userId,
            linkedElsewhereUserId:
                state.linkedElsewhereUserId === userId ? userId : null,
            status: "loading",
            subscriptionPackage: state.userId === userId ? state.subscriptionPackage : null,
            subscriptionProduct: state.userId === userId ? state.subscriptionProduct : null,
        }));

        const promise = getRevenueCatSubscriptionOffering()
            .then(({ subscriptionPackage, subscriptionProduct }) => {
                if (requestId !== latestRequestId) {
                    return;
                }

                set({
                    status: "ready",
                    subscriptionPackage,
                    subscriptionProduct,
                });
            })
            .catch((error) => {
                if (requestId !== latestRequestId) {
                    return;
                }

                set({ status: "error" });

                if (__DEV__) {
                    console.warn("Failed to load RevenueCat offerings", error);
                }
            })
            .finally(() => {
                if (activeRequest?.promise === promise) {
                    activeRequest = null;
                }
            });

        activeRequest = { userId, promise };
        return promise;
    },
    requestIdentitySync: () => {
        set((state) => ({ identitySyncRequestId: state.identitySyncRequestId + 1 }));
    },
    setLinkedElsewhereUser: (userId) => {
        set({ linkedElsewhereUserId: userId });
    },
}));

export default useRevenueCatOfferingStore;
