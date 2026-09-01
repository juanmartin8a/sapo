import { create } from "zustand";

import {
    SUBSCRIPTION_PLAN_KEYS,
    type SubscriptionPlanKey,
} from "@/constants/subscription";
import {
    clearConfirmedSubscriptionSnapshot,
    loadConfirmedSubscriptionSnapshot,
    persistConfirmedSubscriptionSnapshot,
} from "@/lib/confirmed-subscription-cache";

export type SubscriptionStatus = "checking" | "inactive" | "activating" | "active";
type ConvexSubscriptionStatus = Exclude<SubscriptionStatus, "checking">;

interface SubscriptionStatusStoreProps {
    userId: string | null;
    status: SubscriptionStatus;
    // Activation retains the latest access value confirmed by Convex.
    hasActiveSubscription: boolean | null;
    planKey: SubscriptionPlanKey;
    accessExpiresAtMs: number | null;

    setCurrentUser: (userId: string | null) => void;
    hydrateForUser: (userId: string) => Promise<void>;
    applyConvexStatus: (
        userId: string,
        subscription: {
            status: ConvexSubscriptionStatus;
            planKey: SubscriptionPlanKey;
            accessExpiresAtMs: number | null;
        }
    ) => boolean;
    expireForUser: (userId: string) => void;
    clearPersistedStatus: () => void;
}

function getHasActiveSubscription(
    status: ConvexSubscriptionStatus,
    confirmedStatus: boolean | null
) {
    if (status === "activating") {
        return confirmedStatus;
    }

    return status === "active";
}

const useSubscriptionStatusStore = create<SubscriptionStatusStoreProps>((set) => ({
    userId: null,
    status: "inactive",
    hasActiveSubscription: false,
    planKey: SUBSCRIPTION_PLAN_KEYS.FREE,
    accessExpiresAtMs: null,
    setCurrentUser: (userId) => {
        set((state) => {
            if (state.userId === userId) {
                return state;
            }

            return {
                userId,
                status: userId ? "checking" : "inactive",
                hasActiveSubscription: userId ? null : false,
                planKey: SUBSCRIPTION_PLAN_KEYS.FREE,
                accessExpiresAtMs: null,
            };
        });
    },
    hydrateForUser: async (userId) => {
        const snapshot = await loadConfirmedSubscriptionSnapshot(userId);

        if (!snapshot) {
            return;
        }

        set((state) => {
            const canHydrate =
                state.userId === userId &&
                (state.status === "checking" ||
                    (state.status === "activating" && state.hasActiveSubscription === null));

            if (!canHydrate) {
                return state;
            }

            return {
                status: snapshot.status,
                hasActiveSubscription: snapshot.status === "active",
                planKey: snapshot.planKey,
                accessExpiresAtMs: snapshot.accessExpiresAtMs,
            };
        });
    },
    applyConvexStatus: (userId, subscription) => {
        let didSet = false;
        let confirmedSnapshot: Parameters<typeof persistConfirmedSubscriptionSnapshot>[0] | null = null;

        set((state) => {
            if (state.userId !== userId) {
                return state;
            }

            didSet = true;
            const hasActiveSubscription = getHasActiveSubscription(
                subscription.status,
                state.hasActiveSubscription
            );
            const planKey = subscription.status === "activating"
                ? state.planKey
                : subscription.planKey;
            const accessExpiresAtMs = subscription.status === "active"
                ? subscription.accessExpiresAtMs
                : subscription.status === "activating"
                  ? state.accessExpiresAtMs
                  : null;

            if (subscription.status !== "activating") {
                confirmedSnapshot = {
                    userId,
                    status: subscription.status,
                    planKey,
                    accessExpiresAtMs,
                    confirmedAtMs: Date.now(),
                };
            }

            return {
                status: subscription.status,
                hasActiveSubscription,
                planKey,
                accessExpiresAtMs,
            };
        });

        if (confirmedSnapshot) {
            void persistConfirmedSubscriptionSnapshot(confirmedSnapshot);
        }

        return didSet;
    },
    expireForUser: (userId) => {
        let didExpire = false;

        set((state) => {
            if (state.userId !== userId || state.hasActiveSubscription !== true) {
                return state;
            }

            didExpire = true;
            return {
                status: "inactive",
                hasActiveSubscription: false,
                planKey: SUBSCRIPTION_PLAN_KEYS.FREE,
                accessExpiresAtMs: null,
            };
        });

        if (didExpire) {
            void clearConfirmedSubscriptionSnapshot();
        }
    },
    clearPersistedStatus: () => {
        void clearConfirmedSubscriptionSnapshot();
    },
}));

export default useSubscriptionStatusStore;
