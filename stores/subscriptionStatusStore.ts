import { create } from "zustand";

export type SubscriptionStatus = "checking" | "inactive" | "activating" | "active";
type ConvexSubscriptionStatus = Exclude<SubscriptionStatus, "checking">;

interface SubscriptionStatusStoreProps {
    userId: string | null;
    status: SubscriptionStatus;
    // Activation retains the latest access value confirmed by Convex.
    hasActiveSubscription: boolean | null;

    setCurrentUser: (userId: string | null) => void;
    applyConvexStatus: (userId: string, status: ConvexSubscriptionStatus) => boolean;
    expireForUser: (userId: string) => void;
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
    setCurrentUser: (userId) => {
        set((state) => {
            if (state.userId === userId) {
                return state;
            }

            return {
                userId,
                status: userId ? "checking" : "inactive",
                hasActiveSubscription: userId ? null : false,
            };
        });
    },
    applyConvexStatus: (userId, status) => {
        let didSet = false;

        set((state) => {
            if (state.userId !== userId) {
                return state;
            }

            didSet = true;
            return state.status === status
                ? state
                : {
                      status,
                      hasActiveSubscription: getHasActiveSubscription(
                          status,
                          state.hasActiveSubscription
                      ),
                  };
        });

        return didSet;
    },
    expireForUser: (userId) => {
        set((state) => {
            if (state.userId !== userId || state.hasActiveSubscription !== true) {
                return state;
            }

            return {
                status: "inactive",
                hasActiveSubscription: false,
            };
        });
    },
}));

export default useSubscriptionStatusStore;
