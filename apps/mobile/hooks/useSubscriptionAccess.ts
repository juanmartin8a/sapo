import { useAuthState } from "@/providers/AuthStateProvider";
import useSubscriptionStatusStore from "@/stores/subscriptionStatusStore";
import {
    getEffectiveSubscriptionStatus,
    isSubscriptionConfirmedInactive,
} from "@/utils/subscription";

export default function useSubscriptionAccess() {
    const { status: authStatus, userId, sessionUserId } = useAuthState();
    const subscriptionUserId = useSubscriptionStatusStore((state) => state.userId);
    const subscriptionStatus = useSubscriptionStatusStore((state) => state.status);
    const storedHasActiveSubscription = useSubscriptionStatusStore(
        (state) => state.hasActiveSubscription
    );
    const hasActiveSubscription = getEffectiveSubscriptionStatus({
        authStatus,
        userId: authStatus === "checking" ? sessionUserId : userId,
        subscriptionUserId,
        hasActiveSubscription: storedHasActiveSubscription,
    });
    const isCurrentUserActivating =
        authStatus === "authenticated" &&
        userId !== null &&
        subscriptionUserId === userId &&
        subscriptionStatus === "activating";

    return {
        hasActiveSubscription,
        isActivating: isCurrentUserActivating,
        isConfirmedInactive: isSubscriptionConfirmedInactive({
            authStatus,
            userId,
            subscriptionUserId,
            subscriptionStatus,
        }),
        isPending: hasActiveSubscription === null && !isCurrentUserActivating,
    };
}
