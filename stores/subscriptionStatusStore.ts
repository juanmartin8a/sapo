import { create } from "zustand";

interface SubscriptionStatusStoreProps {
    userId: string | null;
    hasActiveSubscription: boolean | null;

    setCurrentUser: (userId: string | null) => void;
    setForUser: (userId: string, hasActiveSubscription: boolean | null) => boolean;
}

const useSubscriptionStatusStore = create<SubscriptionStatusStoreProps>((set) => ({
    userId: null,
    hasActiveSubscription: false,
    setCurrentUser: (userId) => {
        set((state) => {
            if (state.userId === userId) {
                return state;
            }

            return {
                userId,
                hasActiveSubscription: userId ? null : false,
            };
        });
    },
    setForUser: (userId, hasActiveSubscription) => {
        let didSet = false;

        set((state) => {
            if (state.userId !== userId) {
                return state;
            }

            didSet = true;
            return state.hasActiveSubscription === hasActiveSubscription
                ? state
                : { hasActiveSubscription };
        });

        return didSet;
    },
}));

export default useSubscriptionStatusStore;
