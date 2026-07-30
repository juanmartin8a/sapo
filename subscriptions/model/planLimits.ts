import { v } from "convex/values";

import {
    SUBSCRIPTION_PLAN_KEYS,
    SUBSCRIPTION_USAGE_OPERATIONS,
    type SubscriptionPlanKey,
    type SubscriptionUsageOperation,
} from "../../constants/subscriptions";
import type { MutationCtx } from "../_generated/server";

export const subscriptionPlanKeyValidator = v.union(
    v.literal(SUBSCRIPTION_PLAN_KEYS.FREE),
    v.literal(SUBSCRIPTION_PLAN_KEYS.POLYGLOT)
);
export const subscriptionUsageOperationValidator = v.union(
    v.literal(SUBSCRIPTION_USAGE_OPERATIONS.TRANSLATE),
    v.literal(SUBSCRIPTION_USAGE_OPERATIONS.RESPELL)
);

export const subscriptionPlanLimitInputValidator = v.object({
    plan_key: subscriptionPlanKeyValidator,
    translate_input_char_limit: v.number(),
    respell_input_char_limit: v.number(),
    translate_monthly_char_limit: v.number(),
    respell_monthly_char_limit: v.number(),
    is_active: v.boolean(),
});

const DEFAULT_SUBSCRIPTION_PLAN_LIMITS = {
    free: {
        translate_input_char_limit: 500,
        respell_input_char_limit: 0,
        translate_monthly_char_limit: 5_000,
        respell_monthly_char_limit: 0,
    },
    polyglot: {
        translate_input_char_limit: 10_000,
        respell_input_char_limit: 2_000,
        translate_monthly_char_limit: 500_000,
        respell_monthly_char_limit: 50_000,
    },
} as const;

export type { SubscriptionPlanKey, SubscriptionUsageOperation };
export type SubscriptionPlanLimits = {
    translate_input_char_limit: number;
    respell_input_char_limit: number;
    translate_monthly_char_limit: number;
    respell_monthly_char_limit: number;
};

export function getDefaultPlanLimits(planKey: SubscriptionPlanKey) {
    const defaults = DEFAULT_SUBSCRIPTION_PLAN_LIMITS[planKey];
    return {
        translate_input_char_limit: defaults.translate_input_char_limit,
        respell_input_char_limit: defaults.respell_input_char_limit,
        translate_monthly_char_limit: defaults.translate_monthly_char_limit,
        respell_monthly_char_limit: defaults.respell_monthly_char_limit,
    };
}

export async function resolvePlanLimitsForPlanKey(
    ctx: MutationCtx,
    args: {
        plan_key: SubscriptionPlanKey;
        now_ms: number;
    }
) {
    const existingPlanLimitDocs = await ctx.db
        .query("subscription_plan_limits")
        .withIndex("by_plan_key", (query) => query.eq("plan_key", args.plan_key))
        .collect();

    const activePlanLimitDoc = [...existingPlanLimitDocs]
        .filter((doc) => doc.is_active)
        .sort((left, right) => right.updated_at_ms - left.updated_at_ms)[0];
    const defaultPlanLimits = getDefaultPlanLimits(args.plan_key);

    const resolvedPlanLimits = defaultPlanLimits;

    if (!activePlanLimitDoc) {
        await ctx.db.insert("subscription_plan_limits", {
            plan_key: args.plan_key,
            ...resolvedPlanLimits,
            is_active: true,
            updated_at_ms: args.now_ms,
        });
    } else if (
        activePlanLimitDoc.translate_input_char_limit !== resolvedPlanLimits.translate_input_char_limit ||
        activePlanLimitDoc.respell_input_char_limit !== resolvedPlanLimits.respell_input_char_limit ||
        activePlanLimitDoc.translate_monthly_char_limit !== resolvedPlanLimits.translate_monthly_char_limit ||
        activePlanLimitDoc.respell_monthly_char_limit !== resolvedPlanLimits.respell_monthly_char_limit
    ) {
        await ctx.db.patch("subscription_plan_limits", activePlanLimitDoc._id, {
            ...resolvedPlanLimits,
            updated_at_ms: args.now_ms,
        });
    }

    return resolvedPlanLimits;
}

export function resolveOperationLimits(
    operation: SubscriptionUsageOperation,
    planLimits: SubscriptionPlanLimits
) {
    if (operation === SUBSCRIPTION_USAGE_OPERATIONS.TRANSLATE) {
        return {
            input_limit: Math.max(0, planLimits.translate_input_char_limit),
            monthly_limit: Math.max(0, planLimits.translate_monthly_char_limit),
        };
    }

    return {
        input_limit: Math.max(0, planLimits.respell_input_char_limit),
        monthly_limit: Math.max(0, planLimits.respell_monthly_char_limit),
    };
}
