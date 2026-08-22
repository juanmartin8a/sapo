import type { QueryCtx } from "../_generated/server";
import { authComponent } from "../betterAuth/auth";
import { resolveBetterAuthUserId } from "../betterAuth/model/user";
import { SUBSCRIPTION_PLAN_KEYS } from "../constants/subscriptions";
import { getSubscriptionStateByUserId } from "./subscriptions/componentApi";
import { hasUnexpiredSubscriptionAccess } from "./subscriptions/revenueCatApi";

export async function getCurrentSubscriptionStatus(
    ctx: QueryCtx,
    args: { expected_user_id: string }
) {
    const user = await authComponent.safeGetAuthUser(ctx);
    const userId = user ? resolveBetterAuthUserId(user) : null;

    if (!userId || userId !== args.expected_user_id) {
        return null;
    }

    const state = await getSubscriptionStateByUserId(ctx, userId);
    const nowMs = Date.now();
    const hasActiveAccess = hasUnexpiredSubscriptionAccess(state, nowMs);

    const isActivating =
        !hasActiveAccess &&
        typeof state?.pending_active_expires_at_ms === "number" &&
        state.pending_active_expires_at_ms > nowMs;

    return {
        user_id: userId,
        status: hasActiveAccess
            ? ("active" as const)
            : isActivating
              ? ("activating" as const)
              : ("inactive" as const),
        has_active_subscription: hasActiveAccess,
        plan_key: hasActiveAccess ? state!.plan_key : SUBSCRIPTION_PLAN_KEYS.FREE,
    };
}
