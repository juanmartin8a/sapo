import type { AuthStatus } from "@/utils/auth";
import type { SubscriptionStatus } from "@/stores/subscriptionStatusStore";

export function getEffectiveSubscriptionStatus(args: {
    authStatus: AuthStatus;
    userId: string | null;
    subscriptionUserId: string | null;
    hasActiveSubscription: boolean | null;
}) {
    if (args.authStatus === "checking") {
        return args.userId !== null && args.subscriptionUserId === args.userId
            ? args.hasActiveSubscription
            : null;
    }

    if (args.authStatus !== "authenticated") {
        return false;
    }

    return args.subscriptionUserId === args.userId
        ? args.hasActiveSubscription
        : null;
}

export function isSubscriptionConfirmedInactive(args: {
    authStatus: AuthStatus;
    userId: string | null;
    subscriptionUserId: string | null;
    subscriptionStatus: SubscriptionStatus;
}) {
    return args.authStatus === "authenticated" &&
        args.userId !== null &&
        args.subscriptionUserId === args.userId &&
        args.subscriptionStatus === "inactive";
}
