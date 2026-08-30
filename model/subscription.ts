import type { QueryCtx } from "../_generated/server";
import { authComponent } from "../betterAuth/auth";
import { resolveBetterAuthUserId } from "../betterAuth/model/user";
import { SUBSCRIPTION_PLAN_KEYS } from "../constants/subscriptions";
import { getSubscriptionStateByUserId } from "./subscriptions/componentApi";
import {
    getSubscriptionAccessExpiresAtMs,
    hasUnexpiredSubscriptionAccess,
    type CurrentSubscriptionState,
} from "./subscriptions/revenueCatApi";

export function resolveCurrentSubscriptionStatus(
    state:
        | Pick<
              CurrentSubscriptionState,
              | "access_expires_at_ms"
              | "billing_cycle_end_at_ms"
              | "has_active_subscription"
              | "pending_active_expires_at_ms"
              | "plan_key"
          >
        | null
        | undefined,
    nowMs: number
) {
    const hasActiveSubscription = hasUnexpiredSubscriptionAccess(state, nowMs);
    const isActivating =
        state?.has_active_subscription !== true &&
        !hasActiveSubscription &&
        typeof state?.pending_active_expires_at_ms === "number" &&
        state.pending_active_expires_at_ms > nowMs;

    return {
        status: hasActiveSubscription
            ? ("active" as const)
            : isActivating
              ? ("activating" as const)
              : ("inactive" as const),
        has_active_subscription: hasActiveSubscription,
        plan_key: hasActiveSubscription ? state!.plan_key : SUBSCRIPTION_PLAN_KEYS.FREE,
    };
}

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
    const status = resolveCurrentSubscriptionStatus(state, Date.now());
    const accessExpiresAtMs = status.has_active_subscription
        ? getSubscriptionAccessExpiresAtMs(state)
        : null;

    return {
        user_id: userId,
        ...status,
        ...(typeof accessExpiresAtMs === "number"
            ? { access_expires_at_ms: accessExpiresAtMs }
            : {}),
    };
}
