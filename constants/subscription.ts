import {
    DEFAULT_SUBSCRIPTION_PLAN_LIMITS,
    SUBSCRIPTION_USAGE_OPERATIONS,
    type SubscriptionPlanKey,
    type SubscriptionUsageOperation,
} from "@/convex/constants/subscriptions";

export {
    SUBSCRIPTION_PLAN_KEYS,
    SUBSCRIPTION_QUOTA_ERROR_CODES,
} from "@/convex/constants/subscriptions";

export const SUBSCRIPTION_LINKED_ELSEWHERE_ALERT_TITLE = "Subscription linked elsewhere";
export const SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE = "Session changed";

export const SUBSCRIPTION_PLAN_LIMITS = DEFAULT_SUBSCRIPTION_PLAN_LIMITS;
export const TRANSFORMATION_OPERATIONS = SUBSCRIPTION_USAGE_OPERATIONS;

export type { SubscriptionPlanKey };
export type TransformationOperation = SubscriptionUsageOperation;

export const SUBSCRIPTION_PLAN_DISPLAY_NAMES = {
    FREE: "free",
    POLYGLOT: "Polyglot",
} as const;

export function getStoreAccountLabel(platform: string): string {
    if (platform === "android") {
        return "Google";
    }

    return platform === "ios" ? "Apple" : "store";
}

export function getSubscriptionLinkedElsewhereMessage(storeAccountLabel: string): string {
    return `This ${storeAccountLabel} account already has a S A P O subscription linked to another S A P O account. Please sign in to that account, or contact us for support at support@sapo.surf.`;
}
