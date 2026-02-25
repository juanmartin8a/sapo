import { create } from "zustand";

interface SubscriptionStatusStoreProps {
    hasActiveSubscription: boolean | null;

    setHasActiveSubscription: (hasActiveSubscription: boolean | null) => void;
}

const useSubscriptionStatusStore = create<SubscriptionStatusStoreProps>((set) => ({
    hasActiveSubscription: null,
    setHasActiveSubscription: (hasActiveSubscription) => {
        set({ hasActiveSubscription });
    },
}));

export default useSubscriptionStatusStore;
