export const SUBSCRIPTION_PLAN_KEYS = {
    FREE: "free",
    POLYGLOT: "polyglot",
} as const;

export const SUBSCRIPTION_USAGE_OPERATIONS = {
    TRANSLATE: "translate",
    RESPELL: "respell",
} as const;

export const INPUT_CHARACTERS_QUOTA_UNIT = "input_characters";
export const PENDING_ACTIVE_SIGNAL_TTL_MS = 2 * 60 * 1000;

export type SubscriptionPlanKey =
    (typeof SUBSCRIPTION_PLAN_KEYS)[keyof typeof SUBSCRIPTION_PLAN_KEYS];
export type SubscriptionUsageOperation =
    (typeof SUBSCRIPTION_USAGE_OPERATIONS)[keyof typeof SUBSCRIPTION_USAGE_OPERATIONS];
