import type { AuthStatus } from "@/utils/auth";

export function getEffectiveSubscriptionStatus(args: {
    authStatus: AuthStatus;
    userId: string | null;
    subscriptionUserId: string | null;
    hasActiveSubscription: boolean | null;
}) {
    if (args.authStatus === "checking") {
        return null;
    }

    if (args.authStatus !== "authenticated") {
        return false;
    }

    return args.subscriptionUserId === args.userId
        ? args.hasActiveSubscription
        : null;
}
