export const SUBSCRIPTION_PLAN_KEYS = {
    FREE: "free",
    POLYGLOT: "polyglot",
} as const;

export const DEFAULT_SUBSCRIPTION_PLAN_LIMITS = {
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
        respell_monthly_char_limit: 100_000,
    },
} as const;

export const SUBSCRIPTION_USAGE_OPERATIONS = {
    TRANSLATE: "translate",
    RESPELL: "respell",
} as const;

export const SUBSCRIPTION_QUOTA_ERROR_CODES = {
    SUBSCRIPTION_REQUIRED: "subscription_required",
    INPUT_LIMIT_EXCEEDED: "input_limit_exceeded",
    MONTHLY_LIMIT_EXCEEDED: "monthly_limit_exceeded",
    USER_DELETION_IN_PROGRESS: "user_deletion_in_progress",
} as const;

export const INPUT_CHARACTERS_QUOTA_UNIT = "input_characters";
export const PENDING_ACTIVE_SIGNAL_TTL_MS = 5 * 60 * 1000;
export const SUBSCRIPTION_ACTIVATION_RETRY_DELAYS_MS = [
    5_000,
    15_000,
    30_000,
    60_000,
    120_000,
] as const;

export type SubscriptionPlanKey =
    (typeof SUBSCRIPTION_PLAN_KEYS)[keyof typeof SUBSCRIPTION_PLAN_KEYS];
export type SubscriptionUsageOperation =
    (typeof SUBSCRIPTION_USAGE_OPERATIONS)[keyof typeof SUBSCRIPTION_USAGE_OPERATIONS];
