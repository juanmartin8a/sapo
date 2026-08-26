import { create } from "zustand";

type SubscriptionStatus = "checking" | "inactive" | "activating" | "active";

interface SubscriptionStatusStoreProps {
    userId: string | null;
    status: SubscriptionStatus;
    hasActiveSubscription: boolean | null;

    setCurrentUser: (userId: string | null) => void;
    setForUser: (userId: string, status: SubscriptionStatus) => boolean;
}

function getHasActiveSubscription(
    status: SubscriptionStatus,
    confirmedStatus: boolean | null
) {
    if (status === "checking" || status === "activating") {
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
    setForUser: (userId, status) => {
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
}));

export default useSubscriptionStatusStore;
