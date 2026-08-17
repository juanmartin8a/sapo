import type { QueryCtx } from "../_generated/server";
import { authComponent } from "../betterAuth/auth";
import { resolveBetterAuthUserId } from "../betterAuth/model/user";
import { SUBSCRIPTION_PLAN_KEYS } from "../constants/subscriptions";
import { getSubscriptionStateByUserId } from "./subscriptions/componentApi";

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

    const isActivating =
        state?.has_active_subscription !== true &&
        typeof state?.pending_active_expires_at_ms === "number" &&
        state.pending_active_expires_at_ms > Date.now();

    return {
        user_id: userId,
        status: state?.has_active_subscription === true
            ? ("active" as const)
            : isActivating
              ? ("activating" as const)
              : ("inactive" as const),
        has_active_subscription: state?.has_active_subscription === true,
        plan_key: state?.plan_key ?? SUBSCRIPTION_PLAN_KEYS.FREE,
    };
}
