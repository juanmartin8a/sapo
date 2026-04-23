import { v } from "convex/values";

import { api } from "./_generated/api";
import {
    mutation,
    query,
    type MutationCtx,
    type QueryCtx,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
    getUsageEventOwnershipTimestampMs,
    resolveAnonymousFreeMergeAuthority,
    resolveCanonicalFreeAnchorAtMs,
    resolvePreferredFreeAnchorAtMs,
    resolveRebucketedFreeUsageWindow,
} from "./anonymousMerge";
import {
    getBillingCycleWindow,
    getRequiredAnchoredMonthlyWindow,
    getRequiredBillingCycleWindow,
    isSameLogicalQuotaPeriodWindow,
    isSameLogicalSubscriptionWindow,
    type SubscriptionWindow,
} from "./subscriptionWindows";
import { resolveForcedStoppedUsageEventTransition } from "./userDeletionUsageEvents";

const ANONYMOUS_REVENUECAT_ID_PREFIX = "$RCAnonymousID:";

const PROCESSED_EVENT_STATUSES = new Set(["processed", "ignored", "dead_letter"]);

const webhookEventStatusValidator = v.union(
    v.literal("pending"),
    v.literal("failed"),
    v.literal("processed"),
    v.literal("ignored"),
    v.literal("dead_letter")
);

const terminalWebhookEventStatusValidator = v.union(
    v.literal("processed"),
    v.literal("ignored"),
    v.literal("dead_letter")
);

const subscriptionPlanKeyValidator = v.union(v.literal("free"), v.literal("polyglot"));
const subscriptionUsageOperationValidator = v.union(v.literal("translate"), v.literal("respell"));

const subscriptionPlanLimitInputValidator = v.object({
    plan_key: subscriptionPlanKeyValidator,
    translate_input_char_limit: v.number(),
    respell_input_char_limit: v.number(),
    translate_monthly_char_limit: v.number(),
    respell_monthly_char_limit: v.number(),
    is_active: v.boolean(),
});

const DEFAULT_SUBSCRIPTION_PLAN_LIMITS = {
    free: {
        translate_input_char_limit: 10,
        respell_input_char_limit: 10,
        translate_monthly_char_limit: 3_000,
        respell_monthly_char_limit: 3_000,
    },
    polyglot: {
        translate_input_char_limit: 1_000,
        respell_input_char_limit: 300,
        translate_monthly_char_limit: 120_000,
        respell_monthly_char_limit: 30_000,
    },
} as const;

const NEVER_RECONCILE_AT_MS = 253402300799999;
const QUOTA_USAGE_RESERVATION_WATCHDOG_DELAY_MS = 5 * 60 * 1000;
const USER_DELETION_BATCH_LIMIT = 500;

const normalizedWebhookEventValidator = v.object({
    event_id: v.string(),
    event_type: v.string(),
    event_at_ms: v.number(),
    app_user_id: v.optional(v.string()),
    original_app_user_id: v.optional(v.string()),
    aliases: v.array(v.string()),
    transferred_from: v.array(v.string()),
    transferred_to: v.array(v.string()),
    entitlement_ids: v.array(v.string()),
    product_id: v.optional(v.string()),
    transaction_id: v.optional(v.string()),
    store: v.optional(v.string()),
    environment: v.optional(v.string()),
    expiration_at_ms: v.optional(v.number()),
    grace_period_expiration_at_ms: v.optional(v.number()),
    purchased_at_ms: v.optional(v.number()),
});

const retryConfigValidator = v.object({
    max_retry_count: v.number(),
    retry_base_delay_ms: v.number(),
    retry_max_delay_ms: v.number(),
});

const reconciliationSnapshotValidator = v.object({
    has_active_subscription: v.boolean(),
    entitlement_id: v.optional(v.string()),
    product_id: v.optional(v.string()),
    store_subscription_id: v.optional(v.string()),
    period_start_at_ms: v.optional(v.number()),
    period_end_at_ms: v.optional(v.number()),
    store: v.optional(v.string()),
    environment: v.optional(v.string()),
});

type RetryConfig = {
    max_retry_count: number;
    retry_base_delay_ms: number;
    retry_max_delay_ms: number;
};

type SubscriptionPlanKey = "free" | "polyglot";
type SubscriptionUsageOperation = "translate" | "respell";
type SubscriptionPlanLimits = {
    translate_input_char_limit: number;
    respell_input_char_limit: number;
    translate_monthly_char_limit: number;
    respell_monthly_char_limit: number;
};
type SubscriptionStateRecord = Omit<Doc<"subscription_states">, "_id" | "_creationTime">;
type QuotaPeriodSyncSource = {
    window_key: string;
    window_type: SubscriptionWindow["window_type"];
    window_start_at_ms: number;
    window_end_at_ms: number;
    plan_key: SubscriptionPlanKey;
    has_active_subscription: boolean;
    store_subscription_id?: string;
    store_subscription_period_id?: string;
    entitlement_id?: string;
    product_id?: string;
    store?: string;
    environment?: string;
};
type QuotaPeriodBaseDocument = {
    user_id: string | null;
    window_key: string;
    window_type: SubscriptionWindow["window_type"];
    period_start_at_ms: number;
    period_end_at_ms: number;
    plan_key: SubscriptionPlanKey;
    active_subscription: boolean;
    store_subscription_id?: string;
    store_subscription_period_id?: string;
    entitlement_id?: string;
    product_id?: string;
    store?: string;
    environment?: string;
    translate_input_char_limit: number;
    respell_input_char_limit: number;
    translate_period_char_limit: number;
    respell_period_char_limit: number;
};
type ResolvedSubscriptionQuotaContext = {
    existingState: Doc<"subscription_states"> | null;
    planKey: SubscriptionPlanKey;
    resolvedPlanLimits: SubscriptionPlanLimits;
    operationLimits: {
        input_limit: number;
        period_limit: number;
    };
    resolvedWindow: SubscriptionWindow;
};
type MutableQuotaPeriodFields = Partial<Omit<Doc<"quota_periods">, "_id" | "_creationTime">>;
type MutableUsageEventFields = Partial<Omit<Doc<"usage_events">, "_id" | "_creationTime">>;
type DbReaderCtx = Pick<MutationCtx, "db"> | Pick<QueryCtx, "db">;

const BEFORE_CHARGE_USAGE_EVENT_STATES = new Set([
    "failed_before_charge",
    "user_stopped_before_charge",
]);
const AFTER_CHARGE_PROCESSING_USAGE_EVENT_STATES = new Set([
    "processing",
    "failed_after_charge",
    "user_stopped_after_charge",
]);

function isAnonymousRevenueCatAppUserId(value: string) {
    return value.startsWith(ANONYMOUS_REVENUECAT_ID_PREFIX);
}

function resolveCandidateUserIds(event: {
    app_user_id?: string;
    original_app_user_id?: string;
    aliases?: string[];
}): string[] {
    const candidates = [
        event.app_user_id,
        event.original_app_user_id,
        ...(event.aliases ?? []),
    ];

    return candidates.filter(
        (candidate): candidate is string =>
            typeof candidate === "string" &&
            candidate.trim().length > 0 &&
            !isAnonymousRevenueCatAppUserId(candidate)
    );
}

function resolveUserIdFromRevenueCatEvent(event: {
    app_user_id?: string;
    original_app_user_id?: string;
    aliases?: string[];
    transferred_from?: string[];
    transferred_to?: string[];
}) {
    const candidates = resolveTargetUserIdsFromRevenueCatEvent(event);
    return candidates[0] ?? null;
}

function appendUniqueUserIds(targets: string[], candidates: string[]) {
    for (const candidate of candidates) {
        if (!targets.includes(candidate)) {
            targets.push(candidate);
        }
    }
}

function resolveTargetUserIdsFromRevenueCatEvent(
    event: {
        app_user_id?: string;
        original_app_user_id?: string;
        aliases?: string[];
        transferred_from?: string[];
        transferred_to?: string[];
    }
) {
    const targetUserIds: string[] = [];

    appendUniqueUserIds(
        targetUserIds,
        (event.transferred_to ?? []).filter(
            (candidate): candidate is string => !isAnonymousRevenueCatAppUserId(candidate)
        )
    );
    appendUniqueUserIds(
        targetUserIds,
        (event.transferred_from ?? []).filter(
            (candidate): candidate is string => !isAnonymousRevenueCatAppUserId(candidate)
        )
    );
    appendUniqueUserIds(targetUserIds, resolveCandidateUserIds(event));

    return targetUserIds;
}

function resolveNextExpirationReconciliationAtMs(
    hasActiveSubscription: boolean,
    expirationAtMs: number | undefined,
    expirationReconciliationDelayMs: number
) {
    if (!hasActiveSubscription || typeof expirationAtMs !== "number") {
        return NEVER_RECONCILE_AT_MS;
    }

    return expirationAtMs + Math.max(0, expirationReconciliationDelayMs);
}

function isFiniteTimestampMs(value: number | undefined): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function getLegacyCurrentPeriodStartAtMs(state: Record<string, unknown> | null | undefined) {
    const legacyValue = state?.current_period_start_at_ms;
    return typeof legacyValue === "number" && Number.isFinite(legacyValue)
        ? legacyValue
        : undefined;
}

function getLegacyCurrentPeriodEndAtMs(state: Record<string, unknown> | null | undefined) {
    const legacyValue = state?.current_period_end_at_ms;
    return typeof legacyValue === "number" && Number.isFinite(legacyValue)
        ? legacyValue
        : undefined;
}

function getSubscriptionWindowFromQuotaPeriodSyncSource(
    source: Pick<
        QuotaPeriodSyncSource,
        | "window_key"
        | "window_type"
        | "window_start_at_ms"
        | "window_end_at_ms"
        | "store_subscription_period_id"
    >
): SubscriptionWindow & { store_subscription_period_id?: string } {
    return {
        window_key: source.window_key,
        window_type: source.window_type,
        window_start_at_ms: source.window_start_at_ms,
        window_end_at_ms: source.window_end_at_ms,
        ...(source.store_subscription_period_id
            ? { store_subscription_period_id: source.store_subscription_period_id }
            : {}),
    };
}

function buildStoreSubscriptionPeriodId(args: {
    store?: string;
    store_subscription_id?: string;
    period_start_at_ms?: number;
}) {
    if (
        typeof args.store !== "string" ||
        args.store.length === 0 ||
        typeof args.store_subscription_id !== "string" ||
        args.store_subscription_id.length === 0 ||
        typeof args.period_start_at_ms !== "number"
    ) {
        return undefined;
    }

    return `${args.store}:${args.store_subscription_id}:${args.period_start_at_ms}`;
}

function isReusableQuotaPeriod(quotaPeriod: Pick<Doc<"quota_periods">, "status">) {
    return quotaPeriod.status !== "frozen";
}

function getMostRelevantQuotaPeriodForWindow(
    quotaPeriods: Doc<"quota_periods">[],
    window: Pick<
        SubscriptionWindow,
        "window_key" | "window_type" | "window_start_at_ms"
    > & { store_subscription_period_id?: string },
    preferredQuotaPeriodId?: Doc<"quota_periods">["_id"]
) {
    const logicalMatches = quotaPeriods.filter(
        (quotaPeriod) =>
            isReusableQuotaPeriod(quotaPeriod) &&
            isSameLogicalQuotaPeriodWindow(quotaPeriod, window)
    );

    if (preferredQuotaPeriodId) {
        const preferredQuotaPeriod = logicalMatches.find(
            (quotaPeriod) => quotaPeriod._id === preferredQuotaPeriodId
        );

        if (preferredQuotaPeriod) {
            return preferredQuotaPeriod;
        }
    }

    return (
        [...logicalMatches].sort((left, right) => {
            if (left.status !== right.status) {
                return left.status === "open" ? -1 : 1;
            }

            const leftChargedChars = left.translate_charged_chars + left.respell_charged_chars;
            const rightChargedChars = right.translate_charged_chars + right.respell_charged_chars;

            if (leftChargedChars !== rightChargedChars) {
                return rightChargedChars - leftChargedChars;
            }

            const leftLastChargedAtMs = left.last_charged_at_ms ?? 0;
            const rightLastChargedAtMs = right.last_charged_at_ms ?? 0;

            if (leftLastChargedAtMs !== rightLastChargedAtMs) {
                return rightLastChargedAtMs - leftLastChargedAtMs;
            }

            if (left.updated_at_ms !== right.updated_at_ms) {
                return right.updated_at_ms - left.updated_at_ms;
            }

            return right.period_end_at_ms - left.period_end_at_ms;
        })[0] ?? null
    );
}

function getCurrentPaidBillingCycleWindow(
    existingState:
        | {
              billing_cycle_start_at_ms?: number;
              billing_cycle_end_at_ms?: number;
              window_start_at_ms: number;
              window_end_at_ms: number;
          }
        | null,
    currentTimeMs: number
) {
    if (!existingState) {
        return null;
    }

    const billingCycleStartAtMs =
        existingState.billing_cycle_start_at_ms ??
        getLegacyCurrentPeriodStartAtMs(existingState as Record<string, unknown>) ??
        existingState.window_start_at_ms;
    const billingCycleEndAtMs =
        existingState.billing_cycle_end_at_ms ??
        getLegacyCurrentPeriodEndAtMs(existingState as Record<string, unknown>) ??
        existingState.window_end_at_ms;

    const billingCycleWindow = getBillingCycleWindow(
        billingCycleStartAtMs,
        billingCycleEndAtMs
    );

    if (!billingCycleWindow || currentTimeMs >= billingCycleWindow.window_end_at_ms) {
        return null;
    }

    return billingCycleWindow;
}

function resolveFreePeriodAnchorAtMs(args: {
    existingState:
        | {
              has_active_subscription: boolean;
              billing_cycle_end_at_ms?: number;
              free_period_anchor_at_ms?: number;
              window_end_at_ms: number;
              created_at_ms: number;
          }
        | null;
    signup_at_ms?: number;
    now_ms: number;
}) {
    const billingCycleEndAtMs =
        args.existingState?.billing_cycle_end_at_ms ??
        getLegacyCurrentPeriodEndAtMs(args.existingState as Record<string, unknown> | null | undefined) ??
        args.existingState?.window_end_at_ms;
    const lastPaidPeriodEndAtMs = args.existingState?.has_active_subscription
        ? billingCycleEndAtMs
        : undefined;

    return (
        lastPaidPeriodEndAtMs ??
        args.existingState?.free_period_anchor_at_ms ??
        args.signup_at_ms ??
        args.existingState?.created_at_ms ??
        args.now_ms
    );
}

function resolveNextStoreSubscriptionId(args: {
    existingState: Doc<"subscription_states"> | null;
    snapshot: {
        has_active_subscription: boolean;
        product_id?: string;
        store?: string;
        store_subscription_id?: string;
    };
    store_subscription_id_hint?: string;
}) {
    if (!args.snapshot.has_active_subscription) {
        return undefined;
    }

    if (args.store_subscription_id_hint) {
        return args.store_subscription_id_hint;
    }

    if (args.snapshot.store_subscription_id) {
        return args.snapshot.store_subscription_id;
    }

    if (
        args.existingState?.has_active_subscription &&
        args.existingState.store_subscription_id &&
        args.existingState.store === args.snapshot.store &&
        args.existingState.product_id === args.snapshot.product_id
    ) {
        return args.existingState.store_subscription_id;
    }

    return undefined;
}

function getDefaultPlanLimits(planKey: SubscriptionPlanKey) {
    const defaults = DEFAULT_SUBSCRIPTION_PLAN_LIMITS[planKey];
    return {
        translate_input_char_limit: defaults.translate_input_char_limit,
        respell_input_char_limit: defaults.respell_input_char_limit,
        translate_monthly_char_limit: defaults.translate_monthly_char_limit,
        respell_monthly_char_limit: defaults.respell_monthly_char_limit,
    };
}

async function resolvePlanLimitsForPlanKey(
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

    const resolvedPlanLimits = activePlanLimitDoc
        ? {
              translate_input_char_limit: activePlanLimitDoc.translate_input_char_limit,
              respell_input_char_limit: activePlanLimitDoc.respell_input_char_limit,
              translate_monthly_char_limit: activePlanLimitDoc.translate_monthly_char_limit,
              respell_monthly_char_limit: activePlanLimitDoc.respell_monthly_char_limit,
          }
        : getDefaultPlanLimits(args.plan_key);

    if (!activePlanLimitDoc) {
        await ctx.db.insert("subscription_plan_limits", {
            plan_key: args.plan_key,
            ...resolvedPlanLimits,
            is_active: true,
            updated_at_ms: args.now_ms,
        });
    }

    return resolvedPlanLimits;
}

function resolveOperationLimits(
    operation: SubscriptionUsageOperation,
    planLimits: {
        translate_input_char_limit: number;
        respell_input_char_limit: number;
        translate_monthly_char_limit: number;
        respell_monthly_char_limit: number;
    }
) {
    if (operation === "translate") {
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

function getNextRetryAtMs(currentTimeMs: number, retryCount: number, retryConfig: RetryConfig) {
    const safeRetryCount = Math.max(0, retryCount);
    const baseDelay = Math.max(1, retryConfig.retry_base_delay_ms);
    const maxDelay = Math.max(baseDelay, retryConfig.retry_max_delay_ms);
    const multiplier = safeRetryCount <= 0 ? 1 : 2 ** (safeRetryCount - 1);
    const delay = Math.min(baseDelay * multiplier, maxDelay);
    return currentTimeMs + delay;
}

const SUBSCRIPTION_STATE_COMPARISON_FIELDS = [
    "revenuecat_app_user_id",
    "plan_key",
    "has_active_subscription",
    "store_subscription_id",
    "store_subscription_period_id",
    "entitlement_id",
    "product_id",
    "store",
    "environment",
    "billing_cycle_start_at_ms",
    "billing_cycle_end_at_ms",
    "free_period_anchor_at_ms",
    "window_type",
    "window_key",
    "window_start_at_ms",
    "window_end_at_ms",
    "translate_chars_used",
    "respell_chars_used",
    "stale_after_at_ms",
] as const;

function hasComparableSubscriptionStateChanged(
    existingState: Record<string, unknown> | null,
    nextState: Record<string, unknown>
) {
    if (!existingState) {
        return true;
    }

    return SUBSCRIPTION_STATE_COMPARISON_FIELDS.some((field) => existingState[field] !== nextState[field]);
}

async function getLatestSubscriptionStateByUserId(ctx: DbReaderCtx, userId: string) {
    const states = await listSubscriptionStatesByUserId(ctx, userId);

    return [...states].sort((left, right) => right.updated_at_ms - left.updated_at_ms)[0] ?? null;
}

async function listSubscriptionStatesByUserId(ctx: DbReaderCtx, userId: string) {
    return ctx.db
        .query("subscription_states")
        .withIndex("by_user_id", (query) => query.eq("user_id", userId))
        .collect();
}

async function listQuotaPeriodsByUserId(ctx: DbReaderCtx, userId: string) {
    return ctx.db
        .query("quota_periods")
        .withIndex("by_user_id_and_period_start_at_ms", (query) => query.eq("user_id", userId))
        .collect();
}

async function listUserDeletionOperationsByUserId(ctx: DbReaderCtx, userId: string) {
    return ctx.db
        .query("user_deletion_operations")
        .withIndex("by_user_id", (query) => query.eq("user_id", userId))
        .collect();
}

function getLatestUserDeletionOperation(
    operations: Doc<"user_deletion_operations">[]
) {
    return (
        [...operations].sort((left, right) => {
            if (left.updated_at_ms !== right.updated_at_ms) {
                return right.updated_at_ms - left.updated_at_ms;
            }

            return right._creationTime - left._creationTime;
        })[0] ?? null
    );
}

async function listUserDeletionPreparationsByUserId(ctx: DbReaderCtx, userId: string) {
    return ctx.db
        .query("user_deletion_preparations")
        .withIndex("by_user_id", (query) => query.eq("user_id", userId))
        .collect();
}

function getLatestUserDeletionPreparation(
    preparations: Doc<"user_deletion_preparations">[]
) {
    return (
        [...preparations].sort((left, right) => {
            if (left.prepared_at_ms !== right.prepared_at_ms) {
                return right.prepared_at_ms - left.prepared_at_ms;
            }

            return right._creationTime - left._creationTime;
        })[0] ?? null
    );
}

async function getRestorableFrozenQuotaPeriodByStoreSubscriptionPeriodId(
    ctx: MutationCtx,
    args: {
        store_subscription_period_id?: string;
        store?: string;
        product_id?: string;
        period_start_at_ms?: number;
        period_end_at_ms?: number;
    }
) {
    const selectBestRestorableQuotaPeriod = (quotaPeriods: Doc<"quota_periods">[]) => {
        return (
            [...quotaPeriods]
                .filter(
                    (quotaPeriod) =>
                        quotaPeriod.status === "frozen" &&
                        typeof quotaPeriod.restored_at_ms !== "number"
                )
                .sort((left, right) => {
                    const leftFrozenAtMs = left.frozen_at_ms ?? left.updated_at_ms;
                    const rightFrozenAtMs = right.frozen_at_ms ?? right.updated_at_ms;

                    if (leftFrozenAtMs !== rightFrozenAtMs) {
                        return rightFrozenAtMs - leftFrozenAtMs;
                    }

                    const leftChargedChars = left.translate_charged_chars + left.respell_charged_chars;
                    const rightChargedChars = right.translate_charged_chars + right.respell_charged_chars;

                    return rightChargedChars - leftChargedChars;
                })[0] ?? null
        );
    };

    if (args.store_subscription_period_id) {
        const quotaPeriods = await ctx.db
            .query("quota_periods")
            .withIndex("by_store_subscription_period_id", (query) =>
                query.eq("store_subscription_period_id", args.store_subscription_period_id)
            )
            .collect();
        const exactMatch = selectBestRestorableQuotaPeriod(quotaPeriods);

        if (exactMatch) {
            return exactMatch;
        }
    }

    if (
        typeof args.period_start_at_ms !== "number" ||
        typeof args.store !== "string" ||
        typeof args.product_id !== "string"
    ) {
        return null;
    }

    const periodStartAtMs = args.period_start_at_ms;

    const fallbackCandidates = await ctx.db
        .query("quota_periods")
        .withIndex("by_status_and_period_start_at_ms", (query) =>
            query.eq("status", "frozen").eq("period_start_at_ms", periodStartAtMs)
        )
        .collect();

    return selectBestRestorableQuotaPeriod(
        fallbackCandidates.filter(
            (quotaPeriod) =>
                quotaPeriod.store === args.store &&
                quotaPeriod.product_id === args.product_id &&
                (typeof args.period_end_at_ms !== "number" ||
                    quotaPeriod.period_end_at_ms === args.period_end_at_ms)
        )
    );
}

async function listUsageEventsByUserId(ctx: DbReaderCtx, userId: string) {
    return ctx.db
        .query("usage_events")
        .withIndex("by_user_id_and_created_at_ms", (query) => query.eq("user_id", userId))
        .collect();
}

async function listActiveUsageEventsByUserId(ctx: DbReaderCtx, userId: string) {
    const [reservedUsageEvents, processingUsageEvents] = await Promise.all([
        ctx.db
            .query("usage_events")
            .withIndex("by_user_id_and_state", (query) =>
                query.eq("user_id", userId).eq("state", "reserved")
            )
            .collect(),
        ctx.db
            .query("usage_events")
            .withIndex("by_user_id_and_state", (query) =>
                query.eq("user_id", userId).eq("state", "processing")
            )
            .collect(),
    ]);

    return [...reservedUsageEvents, ...processingUsageEvents].sort(
        (left, right) => left.created_at_ms - right.created_at_ms
    );
}

function selectPreferredLinkedSubscriptionState(
    sourceState: Doc<"subscription_states"> | null,
    targetState: Doc<"subscription_states"> | null
) {
    if (!sourceState) {
        return targetState;
    }

    if (!targetState) {
        return sourceState;
    }

    if (sourceState.has_active_subscription !== targetState.has_active_subscription) {
        return sourceState.has_active_subscription ? sourceState : targetState;
    }

    if (sourceState.window_end_at_ms !== targetState.window_end_at_ms) {
        return sourceState.window_end_at_ms > targetState.window_end_at_ms ? sourceState : targetState;
    }

    return sourceState.updated_at_ms > targetState.updated_at_ms ? sourceState : targetState;
}

function getMostRelevantQuotaPeriodForStateSummary(quotaPeriods: Doc<"quota_periods">[]) {
    return (
        [...quotaPeriods].sort((left, right) => {
            if (left.status !== right.status) {
                const statusOrder = {
                    open: 0,
                    closed: 1,
                    frozen: 2,
                } as const;

                return statusOrder[left.status] - statusOrder[right.status];
            }

            if (left.period_end_at_ms !== right.period_end_at_ms) {
                return right.period_end_at_ms - left.period_end_at_ms;
            }

            return right.updated_at_ms - left.updated_at_ms;
        })[0] ?? null
    );
}

function resolveMergedFreePeriodAnchorAtMs(
    sourceState: Doc<"subscription_states"> | null,
    targetState: Doc<"subscription_states"> | null
) {
    return targetState?.free_period_anchor_at_ms ?? sourceState?.free_period_anchor_at_ms;
}

function resolveMergedRevenueCatAppUserId(
    sourceState: Doc<"subscription_states"> | null,
    targetState: Doc<"subscription_states"> | null
) {
    const candidates = [
        targetState?.revenuecat_app_user_id,
        sourceState?.revenuecat_app_user_id,
    ].filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);

    const nonAnonymousCandidate = candidates.find(
        (candidate) => !isAnonymousRevenueCatAppUserId(candidate)
    );

    return nonAnonymousCandidate ?? candidates[0];
}

function resolveMergedLastRevenueCatEventMetadata(
    sourceState: Doc<"subscription_states"> | null,
    targetState: Doc<"subscription_states"> | null
) {
    const targetEventAtMs = targetState?.last_revenuecat_event_at_ms;
    const sourceEventAtMs = sourceState?.last_revenuecat_event_at_ms;

    if (typeof targetEventAtMs === "number" && typeof sourceEventAtMs === "number") {
        return targetEventAtMs >= sourceEventAtMs
            ? {
                  last_revenuecat_event_id: targetState?.last_revenuecat_event_id,
                  last_revenuecat_event_at_ms: targetEventAtMs,
              }
            : {
                  last_revenuecat_event_id: sourceState?.last_revenuecat_event_id,
                  last_revenuecat_event_at_ms: sourceEventAtMs,
              };
    }

    if (typeof targetEventAtMs === "number") {
        return {
            last_revenuecat_event_id: targetState?.last_revenuecat_event_id,
            last_revenuecat_event_at_ms: targetEventAtMs,
        };
    }

    if (typeof sourceEventAtMs === "number") {
        return {
            last_revenuecat_event_id: sourceState?.last_revenuecat_event_id,
            last_revenuecat_event_at_ms: sourceEventAtMs,
        };
    }

    return {
        last_revenuecat_event_id: undefined,
        last_revenuecat_event_at_ms: undefined,
    };
}

type UsageCounterSnapshot = {
    translateCharsUsed: number;
    respellCharsUsed: number;
};

type AppliedUsageDelta = {
    quotaPeriodId: Doc<"quota_periods">["_id"];
    translateChargedChars: number;
    respellChargedChars: number;
    lastAppliedAtMs?: number;
};

function createZeroUsageCounterSnapshot(): UsageCounterSnapshot {
    return {
        translateCharsUsed: 0,
        respellCharsUsed: 0,
    };
}

function addUsageCounterUnits(
    usageCounters: UsageCounterSnapshot,
    operation: SubscriptionUsageOperation,
    units: number
) {
    if (operation === "translate") {
        usageCounters.translateCharsUsed += units;
        return;
    }

    usageCounters.respellCharsUsed += units;
}

function isFreeSubscriptionState(state: Doc<"subscription_states"> | null) {
    return state?.plan_key === "free" && state.has_active_subscription === false;
}

function isFreeQuotaPeriodDoc(quotaPeriod: Doc<"quota_periods">) {
    return (
        quotaPeriod.plan_key === "free" &&
        quotaPeriod.active_subscription === false &&
        quotaPeriod.window_type === "anchored_monthly"
    );
}

function isUsageEventQuotaApplied(usageEvent: Doc<"usage_events">) {
    return typeof usageEvent.quota_applied_at_ms === "number";
}

function resolveAppliedUsageEventUnits(usageEvent: Doc<"usage_events">) {
    return isUsageEventQuotaApplied(usageEvent) && isUsageEventCharged(usageEvent)
        ? resolveHeldUsageEventUnits(usageEvent)
        : 0;
}

function sumAppliedUsageEvents(usageEvents: Doc<"usage_events">[]) {
    const usageCounters = createZeroUsageCounterSnapshot();

    for (const usageEvent of usageEvents) {
        const appliedUnits = resolveAppliedUsageEventUnits(usageEvent);

        if (appliedUnits <= 0) {
            continue;
        }

        addUsageCounterUnits(usageCounters, usageEvent.operation, appliedUnits);
    }

    return usageCounters;
}

function buildUsageEventsByQuotaPeriodId(usageEvents: Doc<"usage_events">[]) {
    const usageEventsByQuotaPeriodId = new Map<string, Doc<"usage_events">[]>();

    for (const usageEvent of usageEvents) {
        const quotaPeriodId = String(usageEvent.quota_period_id);
        const existingUsageEvents = usageEventsByQuotaPeriodId.get(quotaPeriodId);

        if (existingUsageEvents) {
            existingUsageEvents.push(usageEvent);
            continue;
        }

        usageEventsByQuotaPeriodId.set(quotaPeriodId, [usageEvent]);
    }

    return usageEventsByQuotaPeriodId;
}

function buildFreeQuotaPeriodSyncSource(window: SubscriptionWindow): QuotaPeriodSyncSource {
    return {
        window_key: window.window_key,
        window_type: window.window_type,
        window_start_at_ms: window.window_start_at_ms,
        window_end_at_ms: window.window_end_at_ms,
        plan_key: "free",
        has_active_subscription: false,
    };
}

function resolveQuotaPeriodUsageSnapshot(quotaPeriod: Doc<"quota_periods">): UsageCounterSnapshot {
    return {
        translateCharsUsed: quotaPeriod.translate_charged_chars,
        respellCharsUsed: quotaPeriod.respell_charged_chars,
    };
}

function resolvePreferredFreeUsageSnapshotForWindow(args: {
    quotaPeriods: Doc<"quota_periods">[];
    fallbackState: Doc<"subscription_states"> | null;
    window: SubscriptionWindow;
}) {
    const currentQuotaPeriod = getMostRelevantQuotaPeriodForWindow(
        args.quotaPeriods.filter(isFreeQuotaPeriodDoc),
        args.window
    );

    if (currentQuotaPeriod) {
        return resolveQuotaPeriodUsageSnapshot(currentQuotaPeriod);
    }

    return resolveUsageSnapshotForWindow(args.fallbackState, args.window);
}

function assertQuotaPeriodAppliedUsageIntegrity(args: {
    quotaPeriod: Doc<"quota_periods">;
    usageEvents: Doc<"usage_events">[];
}) {
    const appliedUsageCounters = sumAppliedUsageEvents(args.usageEvents);

    if (
        args.quotaPeriod.translate_charged_chars !== appliedUsageCounters.translateCharsUsed ||
        args.quotaPeriod.respell_charged_chars !== appliedUsageCounters.respellCharsUsed
    ) {
        throw new Error(
            `Cannot safely merge quota period ${String(args.quotaPeriod._id)} because applied usage events do not match stored charged counters`
        );
    }
}

function assertFreeStateUsageIntegrity(args: {
    state: Doc<"subscription_states"> | null;
    quotaPeriods: Doc<"quota_periods">[];
    usageEvents: Doc<"usage_events">[];
    free_period_anchor_at_ms: number;
    now_ms: number;
}) {
    if (!isFreeSubscriptionState(args.state)) {
        return;
    }

    const currentWindow = getRequiredAnchoredMonthlyWindow(
        args.free_period_anchor_at_ms,
        args.now_ms
    );
    const currentQuotaPeriod = getMostRelevantQuotaPeriodForWindow(
        args.quotaPeriods.filter(isFreeQuotaPeriodDoc),
        currentWindow
    );

    if (currentQuotaPeriod) {
        return;
    }

    const stateUsageSnapshot = resolveUsageSnapshotForWindow(args.state, currentWindow);

    if (
        stateUsageSnapshot.translateCharsUsed <= 0 &&
        stateUsageSnapshot.respellCharsUsed <= 0
    ) {
        return;
    }

    const appliedUsageEventsInWindow = args.usageEvents.filter((usageEvent) => {
        if (!isUsageEventQuotaApplied(usageEvent)) {
            return false;
        }

        const ownershipTimestampMs = getUsageEventOwnershipTimestampMs(usageEvent);

        return (
            ownershipTimestampMs >= currentWindow.window_start_at_ms &&
            ownershipTimestampMs < currentWindow.window_end_at_ms
        );
    });
    const appliedUsageSnapshot = sumAppliedUsageEvents(appliedUsageEventsInWindow);

    if (
        stateUsageSnapshot.translateCharsUsed !== appliedUsageSnapshot.translateCharsUsed ||
        stateUsageSnapshot.respellCharsUsed !== appliedUsageSnapshot.respellCharsUsed
    ) {
        throw new Error(
            "Cannot safely merge free subscription state because current window counters are not backed by quota periods or usage events"
        );
    }
}

async function replaceMergedSubscriptionStateDocument(
    ctx: MutationCtx,
    args: {
        sourceState: Doc<"subscription_states"> | null;
        targetState: Doc<"subscription_states"> | null;
        nextState: SubscriptionStateRecord;
    }
) {
    if (args.targetState) {
        await ctx.db.replace(args.targetState._id, args.nextState);
    } else if (args.sourceState) {
        await ctx.db.replace(args.sourceState._id, args.nextState);
    } else {
        await ctx.db.insert("subscription_states", args.nextState);
    }

    if (
        args.sourceState &&
        args.targetState &&
        args.sourceState._id !== args.targetState._id
    ) {
        await ctx.db.delete(args.sourceState._id);
    }
}

function buildFreeMergedSubscriptionStateDocument(args: {
    user_id: string;
    sourceState: Doc<"subscription_states"> | null;
    targetState: Doc<"subscription_states"> | null;
    currentQuotaPeriod: Doc<"quota_periods">;
    free_period_anchor_at_ms: number;
    mergedRevenueCatAppUserId: string | undefined;
    mergedLastRevenueCatEvent: {
        last_revenuecat_event_id: string | undefined;
        last_revenuecat_event_at_ms: number | undefined;
    };
    now_ms: number;
}): SubscriptionStateRecord {
    const createdAtMs = Math.min(
        args.sourceState?.created_at_ms ?? args.targetState?.created_at_ms ?? args.now_ms,
        args.targetState?.created_at_ms ?? args.sourceState?.created_at_ms ?? args.now_ms
    );
    const lastSyncedAtMs = Math.max(
        args.sourceState?.last_synced_at_ms ?? 0,
        args.targetState?.last_synced_at_ms ?? 0
    );

    return {
        user_id: args.user_id,
        ...(args.mergedRevenueCatAppUserId
            ? { revenuecat_app_user_id: args.mergedRevenueCatAppUserId }
            : {}),
        plan_key: "free",
        has_active_subscription: false,
        free_period_anchor_at_ms: args.free_period_anchor_at_ms,
        window_type: args.currentQuotaPeriod.window_type,
        window_key: args.currentQuotaPeriod.window_key,
        window_start_at_ms: args.currentQuotaPeriod.period_start_at_ms,
        window_end_at_ms: args.currentQuotaPeriod.period_end_at_ms,
        translate_chars_used: args.currentQuotaPeriod.translate_charged_chars,
        respell_chars_used: args.currentQuotaPeriod.respell_charged_chars,
        ...(args.mergedLastRevenueCatEvent.last_revenuecat_event_id
            ? {
                  last_revenuecat_event_id:
                      args.mergedLastRevenueCatEvent.last_revenuecat_event_id,
              }
            : {}),
        ...(typeof args.mergedLastRevenueCatEvent.last_revenuecat_event_at_ms === "number"
            ? {
                  last_revenuecat_event_at_ms:
                      args.mergedLastRevenueCatEvent.last_revenuecat_event_at_ms,
              }
            : {}),
        last_synced_at_ms: lastSyncedAtMs > 0 ? lastSyncedAtMs : args.now_ms,
        stale_after_at_ms: NEVER_RECONCILE_AT_MS,
        created_at_ms: createdAtMs,
        updated_at_ms: args.now_ms,
    };
}

function assertFreeMergedStateConsistency(args: {
    state: SubscriptionStateRecord;
    currentQuotaPeriod: Doc<"quota_periods">;
    free_period_anchor_at_ms: number;
    now_ms: number;
}) {
    const expectedWindow = getRequiredAnchoredMonthlyWindow(
        args.free_period_anchor_at_ms,
        args.now_ms
    );

    if (!isSameLogicalQuotaPeriodWindow(args.currentQuotaPeriod, expectedWindow)) {
        throw new Error("Merged free quota period does not match the canonical anchored monthly window");
    }

    if (!isSameLogicalSubscriptionWindow(args.state, expectedWindow)) {
        throw new Error("Merged free subscription state does not match the canonical anchored monthly window");
    }

    if (
        args.state.translate_chars_used !== args.currentQuotaPeriod.translate_charged_chars ||
        args.state.respell_chars_used !== args.currentQuotaPeriod.respell_charged_chars
    ) {
        throw new Error("Merged free subscription state counters do not match the canonical quota period");
    }
}

async function resolveOrCreateFreeQuotaPeriodForWindow(
    ctx: MutationCtx,
    args: {
        user_id: string;
        window: SubscriptionWindow;
        currentWindow: SubscriptionWindow;
        planLimits: SubscriptionPlanLimits;
        quotaPeriods: Doc<"quota_periods">[];
        quotaPeriodsById: Map<string, Doc<"quota_periods">>;
        quotaPeriodsByWindowKey: Map<string, Doc<"quota_periods">>;
        now_ms: number;
    }
) {
    const cachedQuotaPeriod = args.quotaPeriodsByWindowKey.get(args.window.window_key);

    if (cachedQuotaPeriod) {
        return cachedQuotaPeriod;
    }

    const existingQuotaPeriod = getMostRelevantQuotaPeriodForWindow(
        args.quotaPeriods.filter(isFreeQuotaPeriodDoc),
        args.window
    );

    if (existingQuotaPeriod) {
        args.quotaPeriodsByWindowKey.set(args.window.window_key, existingQuotaPeriod);
        args.quotaPeriodsById.set(String(existingQuotaPeriod._id), existingQuotaPeriod);
        return existingQuotaPeriod;
    }

    const isCurrentWindow = isSameLogicalSubscriptionWindow(args.window, args.currentWindow);
    const insertedQuotaPeriodId = await ctx.db.insert("quota_periods", {
        ...buildQuotaPeriodBaseDocument({
            user_id: args.user_id,
            source: buildFreeQuotaPeriodSyncSource(args.window),
            planLimits: args.planLimits,
        }),
        translate_charged_chars: 0,
        respell_charged_chars: 0,
        status: isCurrentWindow ? "open" : "closed",
        ...(isCurrentWindow ? {} : { closed_at_ms: args.now_ms }),
        created_at_ms: args.now_ms,
        updated_at_ms: args.now_ms,
    });
    const insertedQuotaPeriod = await ctx.db.get(insertedQuotaPeriodId);

    if (!insertedQuotaPeriod) {
        throw new Error("Failed to create rebucketed free quota period");
    }

    args.quotaPeriods.push(insertedQuotaPeriod);
    args.quotaPeriodsById.set(String(insertedQuotaPeriod._id), insertedQuotaPeriod);
    args.quotaPeriodsByWindowKey.set(args.window.window_key, insertedQuotaPeriod);

    return insertedQuotaPeriod;
}

function accumulateAppliedUsageDelta(
    appliedUsageDeltasByQuotaPeriodId: Map<string, AppliedUsageDelta>,
    usageEvent: Doc<"usage_events">,
    quotaPeriodId: Doc<"quota_periods">["_id"]
) {
    const appliedUnits = resolveAppliedUsageEventUnits(usageEvent);

    if (appliedUnits <= 0) {
        return;
    }

    const quotaPeriodKey = String(quotaPeriodId);
    const existingDelta =
        appliedUsageDeltasByQuotaPeriodId.get(quotaPeriodKey) ?? {
            quotaPeriodId,
            translateChargedChars: 0,
            respellChargedChars: 0,
        };

    if (usageEvent.operation === "translate") {
        existingDelta.translateChargedChars += appliedUnits;
    } else {
        existingDelta.respellChargedChars += appliedUnits;
    }

    const nextAppliedAtMs =
        usageEvent.quota_applied_at_ms ?? usageEvent.charged_at_ms ?? usageEvent.reserved_at_ms;

    if (
        typeof nextAppliedAtMs === "number" &&
        (typeof existingDelta.lastAppliedAtMs !== "number" ||
            nextAppliedAtMs > existingDelta.lastAppliedAtMs)
    ) {
        existingDelta.lastAppliedAtMs = nextAppliedAtMs;
    }

    appliedUsageDeltasByQuotaPeriodId.set(quotaPeriodKey, existingDelta);
}

async function applyAppliedUsageDeltasToQuotaPeriods(
    ctx: MutationCtx,
    args: {
        quotaPeriodsById: Map<string, Doc<"quota_periods">>;
        appliedUsageDeltasByQuotaPeriodId: Map<string, AppliedUsageDelta>;
        now_ms: number;
    }
) {
    for (const [quotaPeriodKey, appliedUsageDelta] of args.appliedUsageDeltasByQuotaPeriodId.entries()) {
        const targetQuotaPeriod = args.quotaPeriodsById.get(quotaPeriodKey);

        if (!targetQuotaPeriod) {
            throw new Error(`Missing target quota period ${quotaPeriodKey} while applying rebucketed usage`);
        }

        const patch: MutableQuotaPeriodFields = {
            translate_charged_chars:
                targetQuotaPeriod.translate_charged_chars + appliedUsageDelta.translateChargedChars,
            respell_charged_chars:
                targetQuotaPeriod.respell_charged_chars + appliedUsageDelta.respellChargedChars,
            updated_at_ms: args.now_ms,
        };

        if (
            typeof appliedUsageDelta.lastAppliedAtMs === "number" &&
            (typeof targetQuotaPeriod.last_charged_at_ms !== "number" ||
                appliedUsageDelta.lastAppliedAtMs > targetQuotaPeriod.last_charged_at_ms)
        ) {
            patch.last_charged_at_ms = appliedUsageDelta.lastAppliedAtMs;
        }

        await ctx.db.patch(targetQuotaPeriod._id, patch);

        args.quotaPeriodsById.set(quotaPeriodKey, {
            ...targetQuotaPeriod,
            ...patch,
        });
    }
}

async function persistMergedFreeSubscriptionState(
    ctx: MutationCtx,
    args: {
        sourceState: Doc<"subscription_states"> | null;
        targetState: Doc<"subscription_states"> | null;
        user_id: string;
        free_period_anchor_at_ms: number;
        fallbackState: Doc<"subscription_states"> | null;
        mergedRevenueCatAppUserId: string | undefined;
        mergedLastRevenueCatEvent: {
            last_revenuecat_event_id: string | undefined;
            last_revenuecat_event_at_ms: number | undefined;
        };
        now_ms: number;
    }
) {
    const planLimits = await resolvePlanLimitsForPlanKey(ctx, {
        plan_key: "free",
        now_ms: args.now_ms,
    });
    const currentWindow = getRequiredAnchoredMonthlyWindow(
        args.free_period_anchor_at_ms,
        args.now_ms
    );
    const targetQuotaPeriods = await listQuotaPeriodsByUserId(ctx, args.user_id);
    const currentWindowUsageSnapshot = resolvePreferredFreeUsageSnapshotForWindow({
        quotaPeriods: targetQuotaPeriods,
        fallbackState: args.fallbackState,
        window: currentWindow,
    });
    const preferredQuotaPeriod = getMostRelevantQuotaPeriodForWindow(
        targetQuotaPeriods.filter(isFreeQuotaPeriodDoc),
        currentWindow
    );
    const currentQuotaPeriod = await upsertOpenQuotaPeriodDoc(ctx, {
        user_id: args.user_id,
        source: buildFreeQuotaPeriodSyncSource(currentWindow),
        planLimits,
        translate_chars_used: currentWindowUsageSnapshot.translateCharsUsed,
        respell_chars_used: currentWindowUsageSnapshot.respellCharsUsed,
        preferred_quota_period_id: preferredQuotaPeriod?._id,
        now_ms: args.now_ms,
    });
    const nextState = buildFreeMergedSubscriptionStateDocument({
        user_id: args.user_id,
        sourceState: args.sourceState,
        targetState: args.targetState,
        currentQuotaPeriod,
        free_period_anchor_at_ms: args.free_period_anchor_at_ms,
        mergedRevenueCatAppUserId: args.mergedRevenueCatAppUserId,
        mergedLastRevenueCatEvent: args.mergedLastRevenueCatEvent,
        now_ms: args.now_ms,
    });

    assertFreeMergedStateConsistency({
        state: nextState,
        currentQuotaPeriod,
        free_period_anchor_at_ms: args.free_period_anchor_at_ms,
        now_ms: args.now_ms,
    });

    await replaceMergedSubscriptionStateDocument(ctx, {
        sourceState: args.sourceState,
        targetState: args.targetState,
        nextState,
    });

    return currentQuotaPeriod;
}

function resolveAnonymousQuotaLinkStatus(args: {
    sourceState: Doc<"subscription_states"> | null;
    targetState: Doc<"subscription_states"> | null;
    targetQuotaPeriods: Doc<"quota_periods">[];
    targetUsageEvents: Doc<"usage_events">[];
}) {
    return args.targetState || args.targetQuotaPeriods.length > 0 || args.targetUsageEvents.length > 0
        ? (args.sourceState || args.targetState ? "merged" : "quota_transferred")
        : "transferred";
}

function getQuotaPeriodMergeIdentity(
    quotaPeriod: Pick<Doc<"quota_periods">, "window_key" | "store_subscription_period_id">
) {
    return quotaPeriod.store_subscription_period_id ?? quotaPeriod.window_key;
}

function doesQuotaPeriodMatchPreferredStatePeriod(
    quotaPeriod: Pick<Doc<"quota_periods">, "window_key" | "store_subscription_period_id">,
    preferredWindowKey: string | undefined,
    preferredStoreSubscriptionPeriodId: string | undefined
) {
    if (preferredStoreSubscriptionPeriodId && quotaPeriod.store_subscription_period_id) {
        return quotaPeriod.store_subscription_period_id === preferredStoreSubscriptionPeriodId;
    }

    return quotaPeriod.window_key === preferredWindowKey;
}

function resolveMergedStateUsageCounters(
    preferredWindowKey: string | undefined,
    preferredStoreSubscriptionPeriodId: string | undefined,
    sourceState: Doc<"subscription_states"> | null,
    targetState: Doc<"subscription_states"> | null,
    sourceQuotaPeriods: Doc<"quota_periods">[],
    targetUserQuotaPeriodsBeforeMerge: Doc<"quota_periods">[],
    mergedTargetQuotaPeriods: Doc<"quota_periods">[]
) {
    const matchingQuotaPeriods = mergedTargetQuotaPeriods.filter(
        (quotaPeriod) =>
            doesQuotaPeriodMatchPreferredStatePeriod(
                quotaPeriod,
                preferredWindowKey,
                preferredStoreSubscriptionPeriodId
            )
    );

    let translateCharsUsed = matchingQuotaPeriods.reduce(
        (total, quotaPeriod) => total + quotaPeriod.translate_charged_chars,
        0
    );
    let respellCharsUsed = matchingQuotaPeriods.reduce(
        (total, quotaPeriod) => total + quotaPeriod.respell_charged_chars,
        0
    );

    const sourceHasQuotaPeriodForWindow = sourceQuotaPeriods.some(
        (quotaPeriod) =>
            doesQuotaPeriodMatchPreferredStatePeriod(
                quotaPeriod,
                preferredWindowKey,
                preferredStoreSubscriptionPeriodId
            )
    );
    const targetHasQuotaPeriodForWindow = targetUserQuotaPeriodsBeforeMerge.some(
        (quotaPeriod) =>
            doesQuotaPeriodMatchPreferredStatePeriod(
                quotaPeriod,
                preferredWindowKey,
                preferredStoreSubscriptionPeriodId
            )
    );

    if (
        sourceState &&
        doesQuotaPeriodMatchPreferredStatePeriod(
            sourceState,
            preferredWindowKey,
            preferredStoreSubscriptionPeriodId
        ) &&
        !sourceHasQuotaPeriodForWindow
    ) {
        translateCharsUsed += sourceState.translate_chars_used ?? 0;
        respellCharsUsed += sourceState.respell_chars_used ?? 0;
    }

    if (
        targetState &&
        doesQuotaPeriodMatchPreferredStatePeriod(
            targetState,
            preferredWindowKey,
            preferredStoreSubscriptionPeriodId
        ) &&
        !targetHasQuotaPeriodForWindow
    ) {
        translateCharsUsed += targetState.translate_chars_used ?? 0;
        respellCharsUsed += targetState.respell_chars_used ?? 0;
    }

    return {
        translateCharsUsed,
        respellCharsUsed,
    };
}

async function resolveCurrentSubscriptionQuotaContext(
    ctx: MutationCtx,
    args: {
        user_id: string;
        operation: SubscriptionUsageOperation;
        signup_at_ms?: number;
        now_ms: number;
    }
): Promise<ResolvedSubscriptionQuotaContext> {
    const existingState = await getLatestSubscriptionStateByUserId(ctx, args.user_id);

    const planKey: SubscriptionPlanKey = existingState?.plan_key ?? "free";
    const resolvedPlanLimits = await resolvePlanLimitsForPlanKey(ctx, {
        plan_key: planKey,
        now_ms: args.now_ms,
    });

    const operationLimits = resolveOperationLimits(args.operation, resolvedPlanLimits);
    const freePeriodAnchorAtMs =
        planKey === "free"
            ? resolveFreePeriodAnchorAtMs({
                  existingState,
                  signup_at_ms: args.signup_at_ms,
                  now_ms: args.now_ms,
              })
            : undefined;

    const resolvedWindow =
        planKey === "free"
            ? getRequiredAnchoredMonthlyWindow(freePeriodAnchorAtMs ?? args.now_ms, args.now_ms)
            : getCurrentPaidBillingCycleWindow(existingState, args.now_ms);

    if (!resolvedWindow) {
        throw new Error("Paid subscription state is stale or missing a billing cycle");
    }

    return {
        existingState,
        planKey,
        resolvedPlanLimits,
        operationLimits: {
            input_limit: operationLimits.input_limit,
            period_limit: operationLimits.monthly_limit,
        },
        resolvedWindow,
    };
}

function resolveUsageSnapshotForWindow(
    existingState: Doc<"subscription_states"> | null,
    resolvedWindow: SubscriptionWindow
) {
    const matchesWindow = existingState
        ? isSameLogicalSubscriptionWindow(existingState, resolvedWindow)
        : false;

    return {
        translateCharsUsed: matchesWindow ? existingState?.translate_chars_used ?? 0 : 0,
        respellCharsUsed: matchesWindow ? existingState?.respell_chars_used ?? 0 : 0,
    };
}

function buildQuotaPeriodBaseDocument(args: {
    user_id: string | null;
    source: QuotaPeriodSyncSource;
    planLimits: SubscriptionPlanLimits;
}): QuotaPeriodBaseDocument {
    return {
        user_id: args.user_id,
        window_key: args.source.window_key,
        window_type: args.source.window_type,
        period_start_at_ms: args.source.window_start_at_ms,
        period_end_at_ms: args.source.window_end_at_ms,
        plan_key: args.source.plan_key,
        active_subscription: args.source.has_active_subscription,
        ...(args.source.store_subscription_id
            ? { store_subscription_id: args.source.store_subscription_id }
            : {}),
        ...(args.source.store_subscription_period_id
            ? { store_subscription_period_id: args.source.store_subscription_period_id }
            : {}),
        ...(args.source.entitlement_id ? { entitlement_id: args.source.entitlement_id } : {}),
        ...(args.source.product_id ? { product_id: args.source.product_id } : {}),
        ...(args.source.store ? { store: args.source.store } : {}),
        ...(args.source.environment ? { environment: args.source.environment } : {}),
        translate_input_char_limit: args.planLimits.translate_input_char_limit,
        respell_input_char_limit: args.planLimits.respell_input_char_limit,
        translate_period_char_limit: args.planLimits.translate_monthly_char_limit,
        respell_period_char_limit: args.planLimits.respell_monthly_char_limit,
    };
}

function buildQuotaPeriodSyncSourceFromSubscriptionState(
    state: Pick<
        SubscriptionStateRecord,
        | "window_key"
        | "window_type"
        | "window_start_at_ms"
        | "window_end_at_ms"
        | "plan_key"
        | "has_active_subscription"
        | "store_subscription_id"
        | "store_subscription_period_id"
        | "entitlement_id"
        | "product_id"
        | "store"
        | "environment"
    >
): QuotaPeriodSyncSource {
    return {
        window_key: state.window_key,
        window_type: state.window_type,
        window_start_at_ms: state.window_start_at_ms,
        window_end_at_ms: state.window_end_at_ms,
        plan_key: state.plan_key,
        has_active_subscription: state.has_active_subscription,
        ...(state.store_subscription_id
            ? { store_subscription_id: state.store_subscription_id }
            : {}),
        ...(state.store_subscription_period_id
            ? { store_subscription_period_id: state.store_subscription_period_id }
            : {}),
        ...(state.entitlement_id ? { entitlement_id: state.entitlement_id } : {}),
        ...(state.product_id ? { product_id: state.product_id } : {}),
        ...(state.store ? { store: state.store } : {}),
        ...(state.environment ? { environment: state.environment } : {}),
    };
}

function buildQuotaPeriodPatch(
    currentQuotaPeriod: Doc<"quota_periods">,
    quotaPeriodBaseDocument: QuotaPeriodBaseDocument,
    args: {
        now_ms: number;
        status: "open" | "closed" | "frozen";
        closed_at_ms?: number;
        frozen_at_ms?: number;
    }
) {
    const patch: MutableQuotaPeriodFields = {};

    if (currentQuotaPeriod.user_id !== quotaPeriodBaseDocument.user_id) {
        patch.user_id = quotaPeriodBaseDocument.user_id;
    }

    if (currentQuotaPeriod.window_key !== quotaPeriodBaseDocument.window_key) {
        patch.window_key = quotaPeriodBaseDocument.window_key;
    }
    if (currentQuotaPeriod.window_type !== quotaPeriodBaseDocument.window_type) {
        patch.window_type = quotaPeriodBaseDocument.window_type;
    }
    if (currentQuotaPeriod.period_start_at_ms !== quotaPeriodBaseDocument.period_start_at_ms) {
        patch.period_start_at_ms = quotaPeriodBaseDocument.period_start_at_ms;
    }
    if (currentQuotaPeriod.period_end_at_ms !== quotaPeriodBaseDocument.period_end_at_ms) {
        patch.period_end_at_ms = quotaPeriodBaseDocument.period_end_at_ms;
    }
    if (currentQuotaPeriod.plan_key !== quotaPeriodBaseDocument.plan_key) {
        patch.plan_key = quotaPeriodBaseDocument.plan_key;
    }
    if (currentQuotaPeriod.active_subscription !== quotaPeriodBaseDocument.active_subscription) {
        patch.active_subscription = quotaPeriodBaseDocument.active_subscription;
    }
    if (currentQuotaPeriod.store_subscription_id !== quotaPeriodBaseDocument.store_subscription_id) {
        patch.store_subscription_id = quotaPeriodBaseDocument.store_subscription_id;
    }
    if (
        currentQuotaPeriod.store_subscription_period_id !==
        quotaPeriodBaseDocument.store_subscription_period_id
    ) {
        patch.store_subscription_period_id = quotaPeriodBaseDocument.store_subscription_period_id;
    }
    if (currentQuotaPeriod.entitlement_id !== quotaPeriodBaseDocument.entitlement_id) {
        patch.entitlement_id = quotaPeriodBaseDocument.entitlement_id;
    }
    if (currentQuotaPeriod.product_id !== quotaPeriodBaseDocument.product_id) {
        patch.product_id = quotaPeriodBaseDocument.product_id;
    }
    if (currentQuotaPeriod.store !== quotaPeriodBaseDocument.store) {
        patch.store = quotaPeriodBaseDocument.store;
    }
    if (currentQuotaPeriod.environment !== quotaPeriodBaseDocument.environment) {
        patch.environment = quotaPeriodBaseDocument.environment;
    }
    if (
        currentQuotaPeriod.translate_input_char_limit !==
        quotaPeriodBaseDocument.translate_input_char_limit
    ) {
        patch.translate_input_char_limit = quotaPeriodBaseDocument.translate_input_char_limit;
    }
    if (
        currentQuotaPeriod.respell_input_char_limit !== quotaPeriodBaseDocument.respell_input_char_limit
    ) {
        patch.respell_input_char_limit = quotaPeriodBaseDocument.respell_input_char_limit;
    }
    if (
        currentQuotaPeriod.translate_period_char_limit !==
        quotaPeriodBaseDocument.translate_period_char_limit
    ) {
        patch.translate_period_char_limit = quotaPeriodBaseDocument.translate_period_char_limit;
    }
    if (
        currentQuotaPeriod.respell_period_char_limit !==
        quotaPeriodBaseDocument.respell_period_char_limit
    ) {
        patch.respell_period_char_limit = quotaPeriodBaseDocument.respell_period_char_limit;
    }
    if (currentQuotaPeriod.status !== args.status) {
        patch.status = args.status;
    }

    if (args.status === "open") {
        if (typeof currentQuotaPeriod.closed_at_ms === "number") {
            patch.closed_at_ms = undefined;
        }
        if (typeof currentQuotaPeriod.frozen_at_ms === "number") {
            patch.frozen_at_ms = undefined;
        }
    } else if (currentQuotaPeriod.closed_at_ms !== args.closed_at_ms) {
        patch.closed_at_ms = args.closed_at_ms;
    }

    if (args.status === "frozen") {
        if (currentQuotaPeriod.frozen_at_ms !== args.frozen_at_ms) {
            patch.frozen_at_ms = args.frozen_at_ms;
        }
    } else if (typeof currentQuotaPeriod.frozen_at_ms === "number") {
        patch.frozen_at_ms = undefined;
    }

    if (typeof currentQuotaPeriod.restored_at_ms === "number") {
        patch.restored_at_ms = undefined;
    }
    if (typeof currentQuotaPeriod.restored_to_quota_period_id !== "undefined") {
        patch.restored_to_quota_period_id = undefined;
    }

    if (Object.keys(patch).length === 0) {
        return null;
    }

    patch.updated_at_ms = args.now_ms;
    return patch;
}

async function closeNonCurrentOpenQuotaPeriodsById(
    ctx: MutationCtx,
    args: {
        user_id: string;
        current_quota_period_id: Doc<"quota_periods">["_id"];
        now_ms: number;
    }
) {
    const quotaPeriods = await listQuotaPeriodsByUserId(ctx, args.user_id);

    for (const quotaPeriod of quotaPeriods) {
        if (quotaPeriod._id === args.current_quota_period_id || quotaPeriod.status !== "open") {
            continue;
        }

        await ctx.db.patch(quotaPeriod._id, {
            status: "closed",
            closed_at_ms: args.now_ms,
            updated_at_ms: args.now_ms,
        });
    }
}

async function closeQuotaPeriodForSubscriptionState(
    ctx: MutationCtx,
    args: {
        user_id: string;
        source: QuotaPeriodSyncSource;
        planLimits: SubscriptionPlanLimits;
        now_ms: number;
    }
) {
    const quotaPeriods = await listQuotaPeriodsByUserId(ctx, args.user_id);
    const currentWindow = getSubscriptionWindowFromQuotaPeriodSyncSource(args.source);
    const currentQuotaPeriod = getMostRelevantQuotaPeriodForWindow(quotaPeriods, currentWindow);

    if (!currentQuotaPeriod) {
        return null;
    }

    const quotaPeriodBaseDocument = buildQuotaPeriodBaseDocument({
        user_id: args.user_id,
        source: args.source,
        planLimits: args.planLimits,
    });
    const patch = buildQuotaPeriodPatch(currentQuotaPeriod, quotaPeriodBaseDocument, {
        status: "closed",
        closed_at_ms: args.now_ms,
        now_ms: args.now_ms,
    });

    if (patch) {
        await ctx.db.patch(currentQuotaPeriod._id, patch);
    }

    return {
        ...currentQuotaPeriod,
        ...(patch ?? {}),
    };
}

async function upsertOpenQuotaPeriodDoc(
    ctx: MutationCtx,
    args: {
        user_id: string;
        source: QuotaPeriodSyncSource;
        planLimits: SubscriptionPlanLimits;
        translate_chars_used: number;
        respell_chars_used: number;
        preferred_quota_period_id?: Doc<"quota_periods">["_id"];
        now_ms: number;
    }
): Promise<Doc<"quota_periods">> {
    const quotaPeriods = await listQuotaPeriodsByUserId(ctx, args.user_id);
    const currentWindow = getSubscriptionWindowFromQuotaPeriodSyncSource(args.source);
    const currentQuotaPeriod = getMostRelevantQuotaPeriodForWindow(
        quotaPeriods,
        currentWindow,
        args.preferred_quota_period_id
    );
    const quotaPeriodBaseDocument = buildQuotaPeriodBaseDocument({
        user_id: args.user_id,
        source: args.source,
        planLimits: args.planLimits,
    });

    if (currentQuotaPeriod) {
        const patch = buildQuotaPeriodPatch(currentQuotaPeriod, quotaPeriodBaseDocument, {
            status: "open",
            now_ms: args.now_ms,
        });

        if (patch) {
            await ctx.db.patch(currentQuotaPeriod._id, patch);
        }

        await closeNonCurrentOpenQuotaPeriodsById(ctx, {
            user_id: args.user_id,
            current_quota_period_id: currentQuotaPeriod._id,
            now_ms: args.now_ms,
        });

        return {
            ...currentQuotaPeriod,
            ...(patch ?? {}),
        };
    }

    const quotaPeriodId = await ctx.db.insert("quota_periods", {
        ...quotaPeriodBaseDocument,
        translate_charged_chars: args.translate_chars_used,
        respell_charged_chars: args.respell_chars_used,
        status: "open",
        created_at_ms: args.now_ms,
        updated_at_ms: args.now_ms,
    });

    await closeNonCurrentOpenQuotaPeriodsById(ctx, {
        user_id: args.user_id,
        current_quota_period_id: quotaPeriodId,
        now_ms: args.now_ms,
    });

    const insertedQuotaPeriod = await ctx.db.get(quotaPeriodId);

    if (!insertedQuotaPeriod) {
        throw new Error("Failed to create quota period");
    }

    return insertedQuotaPeriod;
}

async function ensureCurrentQuotaPeriodDoc(
    ctx: MutationCtx,
    args: {
        user_id: string;
        now_ms: number;
        quotaContext: ResolvedSubscriptionQuotaContext;
    }
): Promise<Doc<"quota_periods">> {
    const { quotaContext } = args;
    const usageSnapshot = resolveUsageSnapshotForWindow(
        quotaContext.existingState,
        quotaContext.resolvedWindow
    );

    return upsertOpenQuotaPeriodDoc(ctx, {
        user_id: args.user_id,
        source: {
            window_key: quotaContext.resolvedWindow.window_key,
            window_type: quotaContext.resolvedWindow.window_type,
            window_start_at_ms: quotaContext.resolvedWindow.window_start_at_ms,
            window_end_at_ms: quotaContext.resolvedWindow.window_end_at_ms,
            plan_key: quotaContext.planKey,
            has_active_subscription:
                quotaContext.existingState?.has_active_subscription ??
                (quotaContext.planKey === "polyglot"),
            ...(quotaContext.existingState?.store_subscription_id
                ? { store_subscription_id: quotaContext.existingState.store_subscription_id }
                : {}),
            ...(quotaContext.existingState?.store_subscription_period_id
                ? {
                      store_subscription_period_id:
                          quotaContext.existingState.store_subscription_period_id,
                  }
                : {}),
            ...(quotaContext.existingState?.entitlement_id
                ? { entitlement_id: quotaContext.existingState.entitlement_id }
                : {}),
            ...(quotaContext.existingState?.product_id
                ? { product_id: quotaContext.existingState.product_id }
                : {}),
            ...(quotaContext.existingState?.store ? { store: quotaContext.existingState.store } : {}),
            ...(quotaContext.existingState?.environment
                ? { environment: quotaContext.existingState.environment }
                : {}),
        },
        planLimits: quotaContext.resolvedPlanLimits,
        translate_chars_used: usageSnapshot.translateCharsUsed,
        respell_chars_used: usageSnapshot.respellCharsUsed,
        now_ms: args.now_ms,
    });
}

function resolveQuotaPeriodChargedUnits(
    quotaPeriod: Doc<"quota_periods">,
    operation: SubscriptionUsageOperation
) {
    return operation === "translate"
        ? quotaPeriod.translate_charged_chars
        : quotaPeriod.respell_charged_chars;
}

function isUsageEventCharged(usageEvent: Doc<"usage_events">) {
    return typeof usageEvent.charged_at_ms === "number";
}

function resolveHeldUsageEventUnits(usageEvent: Doc<"usage_events">) {
    return isUsageEventCharged(usageEvent)
        ? usageEvent.charged_units > 0
            ? usageEvent.charged_units
            : usageEvent.reserved_units
        : usageEvent.reserved_units;
}

function buildForcedStoppedUsageEventPatch(
    usageEvent: Doc<"usage_events">,
    now_ms: number
): MutableUsageEventFields | null {
    if (usageEvent.state !== "reserved" && usageEvent.state !== "processing") {
        return null;
    }

    return resolveForcedStoppedUsageEventTransition({
        state: usageEvent.state,
        held_units: resolveHeldUsageEventUnits(usageEvent),
        is_charged: isUsageEventCharged(usageEvent),
        charged_at_ms: usageEvent.charged_at_ms,
        stopped_at_ms: usageEvent.stopped_at_ms,
        now_ms,
    });
}

async function applyUsageEventChargeToLinkedQuotaPeriod(
    ctx: MutationCtx,
    args: {
        usageEvent: Doc<"usage_events">;
        charged_units: number;
        now_ms: number;
    }
) {
    const quotaPeriod = await ctx.db.get(args.usageEvent.quota_period_id);

    if (!quotaPeriod) {
        return {
            status: "missing_quota_period" as const,
        };
    }

    if (quotaPeriod.status === "frozen" || quotaPeriod.user_id === null) {
        return {
            status: "inactive_quota_period" as const,
        };
    }

    const chargedUnits = Math.max(0, Math.floor(args.charged_units));
    const usageEventOperation = args.usageEvent.operation;

    const quotaPeriodPatch: MutableQuotaPeriodFields = {
        last_charged_at_ms: args.now_ms,
        updated_at_ms: args.now_ms,
    };
    const nextTranslateChargedChars =
        usageEventOperation === "translate"
            ? quotaPeriod.translate_charged_chars + chargedUnits
            : quotaPeriod.translate_charged_chars;
    const nextRespellChargedChars =
        usageEventOperation === "respell"
            ? quotaPeriod.respell_charged_chars + chargedUnits
            : quotaPeriod.respell_charged_chars;

    quotaPeriodPatch.translate_charged_chars = nextTranslateChargedChars;
    quotaPeriodPatch.respell_charged_chars = nextRespellChargedChars;

    await ctx.db.patch(quotaPeriod._id, quotaPeriodPatch);

    const currentSubscriptionState =
        typeof quotaPeriod.user_id === "string"
            ? await getLatestSubscriptionStateByUserId(ctx, quotaPeriod.user_id)
            : null;

    if (
        currentSubscriptionState &&
        isSameLogicalQuotaPeriodWindow(
            quotaPeriod,
            getSubscriptionWindowFromQuotaPeriodSyncSource(currentSubscriptionState)
        )
    ) {
        await ctx.db.patch(currentSubscriptionState._id, {
            translate_chars_used: nextTranslateChargedChars,
            respell_chars_used: nextRespellChargedChars,
            updated_at_ms: args.now_ms,
        });
    }

    return {
        status: "applied" as const,
        charged_units: chargedUnits,
    };
}

async function getOutstandingUsageUnitsForQuotaPeriod(
    ctx: MutationCtx,
    args: {
        quota_period_id: Doc<"usage_events">["quota_period_id"];
        operation: SubscriptionUsageOperation;
    }
) {
    let outstandingUnits = 0;

    const [reservedUsageEvents, processingUsageEvents] = await Promise.all([
        ctx.db
            .query("usage_events")
            .withIndex("by_quota_period_id_and_state", (query) =>
                query.eq("quota_period_id", args.quota_period_id).eq("state", "reserved")
            )
            .collect(),
        ctx.db
            .query("usage_events")
            .withIndex("by_quota_period_id_and_state", (query) =>
                query.eq("quota_period_id", args.quota_period_id).eq("state", "processing")
            )
            .collect(),
    ]);

    for (const usageEvent of reservedUsageEvents) {
        if (usageEvent.operation !== args.operation) {
            continue;
        }

        outstandingUnits += Math.max(0, Math.floor(usageEvent.reserved_units));
    }

    for (const usageEvent of processingUsageEvents) {
        if (
            usageEvent.operation !== args.operation ||
            !isUsageEventCharged(usageEvent) ||
            typeof usageEvent.quota_applied_at_ms === "number"
        ) {
            continue;
        }

        outstandingUnits += resolveHeldUsageEventUnits(usageEvent);
    }

    return outstandingUnits;
}

async function evaluateQuotaAvailability(
    ctx: MutationCtx,
    args: {
        user_id: string;
        operation: SubscriptionUsageOperation;
        input_char_count: number;
        signup_at_ms?: number;
        now_ms: number;
    }
) {
    const sanitizedInputCharCount = Math.max(0, Math.floor(args.input_char_count));

    if (sanitizedInputCharCount <= 0) {
        return {
            allowed: false as const,
            reason: "invalid_input_char_count" as const,
        };
    }

    const quotaContext = await resolveCurrentSubscriptionQuotaContext(ctx, args);

    if (sanitizedInputCharCount > quotaContext.operationLimits.input_limit) {
        return {
            allowed: false as const,
            reason: "input_limit_exceeded" as const,
            plan_key: quotaContext.planKey,
            input_limit: quotaContext.operationLimits.input_limit,
            monthly_limit: quotaContext.operationLimits.period_limit,
        };
    }

    const quotaPeriod = await ensureCurrentQuotaPeriodDoc(ctx, {
        user_id: args.user_id,
        now_ms: args.now_ms,
        quotaContext,
    });
    const chargedUnits = resolveQuotaPeriodChargedUnits(quotaPeriod, args.operation);
    const outstandingUnits = await getOutstandingUsageUnitsForQuotaPeriod(ctx, {
        quota_period_id: quotaPeriod._id,
        operation: args.operation,
    });
    const usedChars = chargedUnits + outstandingUnits;

    if (usedChars + sanitizedInputCharCount > quotaContext.operationLimits.period_limit) {
        return {
            allowed: false as const,
            reason: "monthly_limit_exceeded" as const,
            plan_key: quotaContext.planKey,
            input_limit: quotaContext.operationLimits.input_limit,
            monthly_limit: quotaContext.operationLimits.period_limit,
            used_chars: usedChars,
        };
    }

    return {
        allowed: true as const,
        plan_key: quotaContext.planKey,
        input_limit: quotaContext.operationLimits.input_limit,
        monthly_limit: quotaContext.operationLimits.period_limit,
        used_chars: usedChars,
        sanitized_input_char_count: sanitizedInputCharCount,
        quotaPeriod,
        quotaContext,
    };
}

export const upsertSubscriptionPlanLimits = mutation({
    args: {
        plans: v.array(subscriptionPlanLimitInputValidator),
        now_ms: v.number(),
    },
    handler: async (ctx, args) => {
        const sanitizedPlans = args.plans.map((plan) => ({
            ...plan,
            translate_input_char_limit: Math.max(0, Math.floor(plan.translate_input_char_limit)),
            respell_input_char_limit: Math.max(0, Math.floor(plan.respell_input_char_limit)),
            translate_monthly_char_limit: Math.max(0, Math.floor(plan.translate_monthly_char_limit)),
            respell_monthly_char_limit: Math.max(0, Math.floor(plan.respell_monthly_char_limit)),
        }));

        for (const plan of sanitizedPlans) {
            const existingPlanLimits = await ctx.db
                .query("subscription_plan_limits")
                .withIndex("by_plan_key", (query) => query.eq("plan_key", plan.plan_key))
                .collect();

            const sortedPlanLimits = [...existingPlanLimits].sort(
                (left, right) => right.updated_at_ms - left.updated_at_ms
            );
            const targetDoc = sortedPlanLimits[0] ?? null;

            const nextDocument = {
                plan_key: plan.plan_key,
                translate_input_char_limit: plan.translate_input_char_limit,
                respell_input_char_limit: plan.respell_input_char_limit,
                translate_monthly_char_limit: plan.translate_monthly_char_limit,
                respell_monthly_char_limit: plan.respell_monthly_char_limit,
                is_active: plan.is_active,
                updated_at_ms: args.now_ms,
            };

            if (targetDoc) {
                await ctx.db.patch(targetDoc._id, nextDocument);
            } else {
                await ctx.db.insert("subscription_plan_limits", nextDocument);
            }

            for (const duplicateDoc of sortedPlanLimits.slice(1)) {
                if (duplicateDoc.is_active) {
                    await ctx.db.patch(duplicateDoc._id, {
                        is_active: false,
                        updated_at_ms: args.now_ms,
                    });
                }
            }
        }

        return {
            status: "ok",
            plans_updated: sanitizedPlans.length,
        };
    },
});

export const reserveSubscriptionQuotaUsage = mutation({
    args: {
        req_id: v.string(),
        user_id: v.string(),
        operation: subscriptionUsageOperationValidator,
        input_char_count: v.number(),
        signup_at_ms: v.optional(v.number()),
        model: v.optional(v.string()),
        now_ms: v.number(),
    },
    handler: async (ctx, args) => {
        const activeDeletionOperation = getLatestUserDeletionOperation(
            await listUserDeletionOperationsByUserId(ctx, args.user_id)
        );

        if (activeDeletionOperation) {
            return {
                allowed: false,
                reason: "user_deletion_in_progress",
            };
        }

        const existingUsageEvent = await ctx.db
            .query("usage_events")
            .withIndex("by_user_id_and_req_id", (query) =>
                query.eq("user_id", args.user_id).eq("req_id", args.req_id)
            )
            .first();

        if (existingUsageEvent) {
            return {
                allowed: false,
                reason: "duplicate_req_id",
                usage_event_id: existingUsageEvent._id,
                state: existingUsageEvent.state,
            };
        }

        const availabilityResult = await evaluateQuotaAvailability(ctx, args);

        if (!availabilityResult.allowed) {
            return availabilityResult;
        }

        const usageEventId = await ctx.db.insert("usage_events", {
            req_id: args.req_id,
            user_id: args.user_id,
            quota_period_id: availabilityResult.quotaPeriod._id,
            operation: args.operation,
            ...(args.model ? { model: args.model } : {}),
            quota_unit: "input_characters",
            reserved_units: availabilityResult.sanitized_input_char_count,
            charged_units: 0,
            state: "reserved",
            reserved_at_ms: args.now_ms,
            created_at_ms: args.now_ms,
            updated_at_ms: args.now_ms,
        });

        await ctx.scheduler.runAfter(
            QUOTA_USAGE_RESERVATION_WATCHDOG_DELAY_MS,
            api.webhook.applyUsageEventChargeToQuotaPeriod,
            {
                usage_event_id: usageEventId,
                now_ms: args.now_ms + QUOTA_USAGE_RESERVATION_WATCHDOG_DELAY_MS,
            }
        );

        return {
            allowed: true,
            usage_event_id: usageEventId,
            quota_period_id: availabilityResult.quotaPeriod._id,
            reserved_units: availabilityResult.sanitized_input_char_count,
            plan_key: availabilityResult.plan_key,
            input_limit: availabilityResult.input_limit,
            monthly_limit: availabilityResult.monthly_limit,
            used_chars: availabilityResult.used_chars,
        };
    },
});

export const chargeSubscriptionQuotaUsage = mutation({
    args: {
        usage_event_id: v.id("usage_events"),
        now_ms: v.number(),
    },
    handler: async (ctx, args) => {
        const usageEvent = await ctx.db.get(args.usage_event_id);

        if (!usageEvent) {
            return {
                status: "missing",
            };
        }

        if (BEFORE_CHARGE_USAGE_EVENT_STATES.has(usageEvent.state)) {
            return {
                status: "not_chargeable",
                state: usageEvent.state,
            };
        }

        if (usageEvent.state !== "reserved" && usageEvent.state !== "processing") {
            if (isUsageEventCharged(usageEvent)) {
                return {
                    status: "already_charged",
                    state: usageEvent.state,
                    charged_units: resolveHeldUsageEventUnits(usageEvent),
                };
            }

            return {
                status: "invalid_state",
                state: usageEvent.state,
            };
        }

        if (isUsageEventCharged(usageEvent) && typeof usageEvent.quota_applied_at_ms === "number") {
            return {
                status: "already_charged",
                state: usageEvent.state,
                charged_units: resolveHeldUsageEventUnits(usageEvent),
            };
        }

        if (isUsageEventCharged(usageEvent) && typeof usageEvent.quota_applied_at_ms !== "number") {
            const chargedUnits = resolveHeldUsageEventUnits(usageEvent);
            const applyResult = await applyUsageEventChargeToLinkedQuotaPeriod(ctx, {
                usageEvent,
                charged_units: chargedUnits,
                now_ms: args.now_ms,
            });

            if (applyResult.status !== "applied") {
                return applyResult;
            }

            await ctx.db.patch(usageEvent._id, {
                state: usageEvent.state === "reserved" ? "processing" : usageEvent.state,
                charged_units: chargedUnits,
                charged_at_ms: usageEvent.charged_at_ms ?? args.now_ms,
                quota_applied_at_ms: args.now_ms,
                updated_at_ms: args.now_ms,
            });

            return {
                status: "charged",
                charged_units: chargedUnits,
            };
        }

        if (usageEvent.state !== "reserved") {
            return {
                status: "invalid_state",
                state: usageEvent.state,
            };
        }

        const chargedUnits = usageEvent.reserved_units;
        const applyResult = await applyUsageEventChargeToLinkedQuotaPeriod(ctx, {
            usageEvent,
            charged_units: chargedUnits,
            now_ms: args.now_ms,
        });

        if (applyResult.status !== "applied") {
            return applyResult;
        }

        await ctx.db.patch(usageEvent._id, {
            state: "processing",
            charged_units: chargedUnits,
            charged_at_ms: args.now_ms,
            quota_applied_at_ms: args.now_ms,
            updated_at_ms: args.now_ms,
        });

        return {
            status: "charged",
            charged_units: chargedUnits,
        };
    },
});

export const completeSubscriptionQuotaUsage = mutation({
    args: {
        usage_event_id: v.id("usage_events"),
        now_ms: v.number(),
    },
    handler: async (ctx, args) => {
        const usageEvent = await ctx.db.get(args.usage_event_id);

        if (!usageEvent) {
            return {
                status: "missing",
            };
        }

        if (usageEvent.state === "completed") {
            return {
                status: "completed",
                charged_during_completion: isUsageEventCharged(usageEvent),
            };
        }

        if (
            usageEvent.state !== "reserved" &&
            usageEvent.state !== "processing"
        ) {
            return {
                status: "invalid_state",
                state: usageEvent.state,
            };
        }

        const chargedDuringCompletion = isUsageEventCharged(usageEvent);
        const patch: MutableUsageEventFields = {
            state: "completed",
            completed_at_ms: args.now_ms,
            updated_at_ms: args.now_ms,
        };

        if (chargedDuringCompletion) {
            patch.charged_units = resolveHeldUsageEventUnits(usageEvent);
            patch.charged_at_ms = usageEvent.charged_at_ms ?? args.now_ms;
        }

        await ctx.db.patch(usageEvent._id, patch);

        return {
            status: "completed",
            charged_during_completion: chargedDuringCompletion,
        };
    },
});

export const markSubscriptionQuotaUsageFailed = mutation({
    args: {
        usage_event_id: v.id("usage_events"),
        after_charge: v.boolean(),
        now_ms: v.number(),
    },
    handler: async (ctx, args) => {
        const usageEvent = await ctx.db.get(args.usage_event_id);

        if (!usageEvent) {
            return {
                status: "missing",
            };
        }

        const nextState = args.after_charge ? "failed_after_charge" : "failed_before_charge";

        if (usageEvent.state === nextState) {
            return {
                status: nextState,
            };
        }

        if (args.after_charge) {
            if (
                !isUsageEventCharged(usageEvent) ||
                !AFTER_CHARGE_PROCESSING_USAGE_EVENT_STATES.has(usageEvent.state)
            ) {
                return {
                    status: "invalid_state",
                    state: usageEvent.state,
                };
            }
        } else if (usageEvent.state !== "reserved" || isUsageEventCharged(usageEvent)) {
            return {
                status: "invalid_state",
                state: usageEvent.state,
            };
        }

        const patch: MutableUsageEventFields = {
            state: nextState,
            failed_at_ms: args.now_ms,
            updated_at_ms: args.now_ms,
        };

        if (args.after_charge) {
            patch.charged_units = resolveHeldUsageEventUnits(usageEvent);
            patch.charged_at_ms = usageEvent.charged_at_ms ?? args.now_ms;
        }

        await ctx.db.patch(usageEvent._id, patch);

        return {
            status: nextState,
        };
    },
});

export const markSubscriptionQuotaUsageStopped = mutation({
    args: {
        usage_event_id: v.id("usage_events"),
        after_charge: v.boolean(),
        now_ms: v.number(),
    },
    handler: async (ctx, args) => {
        const usageEvent = await ctx.db.get(args.usage_event_id);

        if (!usageEvent) {
            return {
                status: "missing",
            };
        }

        const nextState = args.after_charge ? "user_stopped_after_charge" : "user_stopped_before_charge";

        if (usageEvent.state === nextState) {
            return {
                status: nextState,
            };
        }

        if (args.after_charge) {
            if (
                !isUsageEventCharged(usageEvent) ||
                !AFTER_CHARGE_PROCESSING_USAGE_EVENT_STATES.has(usageEvent.state)
            ) {
                return {
                    status: "invalid_state",
                    state: usageEvent.state,
                };
            }
        } else if (usageEvent.state !== "reserved" || isUsageEventCharged(usageEvent)) {
            return {
                status: "invalid_state",
                state: usageEvent.state,
            };
        }

        const patch: MutableUsageEventFields = {
            state: nextState,
            stopped_at_ms: args.now_ms,
            updated_at_ms: args.now_ms,
        };

        if (args.after_charge) {
            patch.charged_units = resolveHeldUsageEventUnits(usageEvent);
            patch.charged_at_ms = usageEvent.charged_at_ms ?? args.now_ms;
        }

        await ctx.db.patch(usageEvent._id, patch);

        return {
            status: nextState,
        };
    },
});

export const applyUsageEventChargeToQuotaPeriod = mutation({
    args: {
        usage_event_id: v.id("usage_events"),
        now_ms: v.number(),
    },
    handler: async (ctx, args) => {
        const usageEvent = await ctx.db.get(args.usage_event_id);

        if (!usageEvent) {
            return {
                status: "missing",
            };
        }

        if (typeof usageEvent.quota_applied_at_ms === "number") {
            return {
                status: "already_applied",
            };
        }

        if (usageEvent.state === "reserved" && !isUsageEventCharged(usageEvent)) {
            await ctx.db.patch(usageEvent._id, {
                state: "failed_before_charge",
                failed_at_ms: usageEvent.failed_at_ms ?? args.now_ms,
                updated_at_ms: args.now_ms,
            });

            return {
                status: "stale_reserved_marked_failed",
            };
        }

        if (!isUsageEventCharged(usageEvent)) {
            return {
                status: "skipped",
                state: usageEvent.state,
            };
        }

        const chargedUnits = resolveHeldUsageEventUnits(usageEvent);
        const applyResult = await applyUsageEventChargeToLinkedQuotaPeriod(ctx, {
            usageEvent,
            charged_units: chargedUnits,
            now_ms: args.now_ms,
        });

        if (applyResult.status !== "applied") {
            return applyResult;
        }

        const patch: MutableUsageEventFields = {
            charged_units: chargedUnits,
            charged_at_ms: usageEvent.charged_at_ms ?? args.now_ms,
            quota_applied_at_ms: args.now_ms,
            updated_at_ms: args.now_ms,
        };

        if (usageEvent.state === "reserved") {
            patch.state = "processing";
        }

        await ctx.db.patch(usageEvent._id, patch);

        return {
            status: "applied",
            charged_units: chargedUnits,
            state: patch.state ?? usageEvent.state,
        };
    },
});

export const ingestRevenueCatEvent = mutation({
    args: {
        normalized_event: normalizedWebhookEventValidator,
        raw_payload: v.optional(v.string()),
        received_at_ms: v.number(),
    },
    handler: async (ctx, args) => {
        const existingEvent = await ctx.db
            .query("revenue_cat_events")
            .withIndex("by_event_id", (query) => query.eq("event_id", args.normalized_event.event_id))
            .first();

        if (existingEvent) {
            return {
                event_doc_id: existingEvent._id,
                already_exists: true,
            };
        }

        const resolvedUserId = resolveUserIdFromRevenueCatEvent(args.normalized_event) ?? undefined;

        if (resolvedUserId) {
            const activeDeletionOperation = getLatestUserDeletionOperation(
                await listUserDeletionOperationsByUserId(ctx, resolvedUserId)
            );

            if (activeDeletionOperation) {
                throw new Error("Cannot ingest RevenueCat event while user deletion is in progress");
            }
        }

        const insertionTimeMs = args.received_at_ms;

        const eventDocument = {
            event_id: args.normalized_event.event_id,
            event_type: args.normalized_event.event_type,
            event_at_ms: args.normalized_event.event_at_ms,
            received_at_ms: args.received_at_ms,
            aliases: args.normalized_event.aliases,
            transferred_from: args.normalized_event.transferred_from,
            transferred_to: args.normalized_event.transferred_to,
            entitlement_ids: args.normalized_event.entitlement_ids,
            status: "pending" as const,
            retry_count: 0,
            next_retry_at_ms: args.received_at_ms,
            created_at_ms: insertionTimeMs,
            updated_at_ms: insertionTimeMs,
            ...(args.normalized_event.app_user_id
                ? { app_user_id: args.normalized_event.app_user_id }
                : {}),
            ...(args.normalized_event.original_app_user_id
                ? { original_app_user_id: args.normalized_event.original_app_user_id }
                : {}),
            ...(resolvedUserId ? { user_id: resolvedUserId } : {}),
            ...(args.normalized_event.product_id
                ? { product_id: args.normalized_event.product_id }
                : {}),
            ...(args.normalized_event.transaction_id
                ? { transaction_id: args.normalized_event.transaction_id }
                : {}),
            ...(args.normalized_event.store ? { store: args.normalized_event.store } : {}),
            ...(args.normalized_event.environment
                ? { environment: args.normalized_event.environment }
                : {}),
            ...(typeof args.normalized_event.expiration_at_ms === "number"
                ? { expiration_at_ms: args.normalized_event.expiration_at_ms }
                : {}),
            ...(typeof args.normalized_event.grace_period_expiration_at_ms === "number"
                ? {
                      grace_period_expiration_at_ms:
                          args.normalized_event.grace_period_expiration_at_ms,
                  }
                : {}),
            ...(typeof args.normalized_event.purchased_at_ms === "number"
                ? { purchased_at_ms: args.normalized_event.purchased_at_ms }
                : {}),
            ...(typeof args.raw_payload === "string" ? { payload: args.raw_payload } : {}),
        };

        const eventDocId = await ctx.db.insert("revenue_cat_events", eventDocument);

        return {
            event_doc_id: eventDocId,
            already_exists: false,
        };
    },
});

export const getRevenueCatEventForProcessing = query({
    args: {
        event_doc_id: v.id("revenue_cat_events"),
    },
    handler: async (ctx, args) => {
        const eventDoc = await ctx.db.get(args.event_doc_id);

        if (!eventDoc) {
            return null;
        }

        return {
            event_id: eventDoc.event_id,
            event_type: eventDoc.event_type,
            status: eventDoc.status,
            user_id: eventDoc.user_id,
            transaction_id: eventDoc.transaction_id,
            target_user_ids: resolveTargetUserIdsFromRevenueCatEvent(eventDoc),
        };
    },
});

export const markRevenueCatEventProcessed = mutation({
    args: {
        event_doc_id: v.id("revenue_cat_events"),
        now_ms: v.number(),
        user_id: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const eventDoc = await ctx.db.get(args.event_doc_id);

        if (!eventDoc || PROCESSED_EVENT_STATUSES.has(eventDoc.status)) {
            return {
                status: eventDoc?.status ?? "missing",
            };
        }

        await ctx.db.patch(eventDoc._id, {
            status: "processed",
            retry_count: 0,
            next_retry_at_ms: args.now_ms,
            processed_at_ms: args.now_ms,
            updated_at_ms: args.now_ms,
            ...(args.user_id ? { user_id: args.user_id } : {}),
        });

        return {
            status: "processed",
        };
    },
});

export const markRevenueCatEventIgnored = mutation({
    args: {
        event_doc_id: v.id("revenue_cat_events"),
        now_ms: v.number(),
        reason: v.string(),
        user_id: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const eventDoc = await ctx.db.get(args.event_doc_id);

        if (!eventDoc || PROCESSED_EVENT_STATUSES.has(eventDoc.status)) {
            return {
                status: eventDoc?.status ?? "missing",
            };
        }

        await ctx.db.patch(eventDoc._id, {
            status: "ignored",
            retry_count: 0,
            next_retry_at_ms: args.now_ms,
            processed_at_ms: args.now_ms,
            updated_at_ms: args.now_ms,
            last_error: args.reason.slice(0, 400),
            ...(args.user_id ? { user_id: args.user_id } : {}),
        });

        return {
            status: "ignored",
        };
    },
});

export const markRevenueCatEventProcessingFailure = mutation({
    args: {
        event_doc_id: v.id("revenue_cat_events"),
        now_ms: v.number(),
        error_message: v.string(),
        retry_config: retryConfigValidator,
    },
    handler: async (ctx, args) => {
        const eventDoc = await ctx.db.get(args.event_doc_id);

        if (!eventDoc || PROCESSED_EVENT_STATUSES.has(eventDoc.status)) {
            return {
                status: eventDoc?.status ?? "missing",
            };
        }

        const nextRetryCount = eventDoc.retry_count + 1;
        const maxRetryCount = Math.max(1, args.retry_config.max_retry_count);
        const hasReachedMaxRetries = nextRetryCount >= maxRetryCount;
        const nextStatus = hasReachedMaxRetries ? "dead_letter" : "failed";
        const nextRetryAtMs = hasReachedMaxRetries
            ? args.now_ms
            : getNextRetryAtMs(args.now_ms, nextRetryCount, args.retry_config);

        await ctx.db.patch(eventDoc._id, {
            status: nextStatus,
            retry_count: nextRetryCount,
            next_retry_at_ms: nextRetryAtMs,
            updated_at_ms: args.now_ms,
            last_error: args.error_message.slice(0, 400),
        });

        return {
            status: nextStatus,
            retry_count: nextRetryCount,
            next_retry_at_ms: nextRetryAtMs,
        };
    },
});

export const listRetryableRevenueCatEvents = query({
    args: {
        status: webhookEventStatusValidator,
        now_ms: v.number(),
        limit: v.number(),
    },
    handler: async (ctx, args) => {
        if (args.status !== "pending" && args.status !== "failed") {
            return [];
        }

        const safeLimit = Math.max(1, Math.min(args.limit, 100));

        const docs = await ctx.db
            .query("revenue_cat_events")
            .withIndex("by_status_and_next_retry_at_ms", (query) =>
                query.eq("status", args.status).lte("next_retry_at_ms", args.now_ms)
            )
            .take(safeLimit);

        return docs.map((doc) => doc._id);
    },
});

export const listRevenueCatEventsForStatus = query({
    args: {
        status: webhookEventStatusValidator,
        limit: v.number(),
    },
    handler: async (ctx, args) => {
        const safeLimit = Math.max(1, Math.min(args.limit, 100));

        const docs = await ctx.db
            .query("revenue_cat_events")
            .withIndex("by_status_and_next_retry_at_ms", (query) => query.eq("status", args.status))
            .take(safeLimit);

        return docs.map((doc) => ({
            event_doc_id: doc._id,
            event_id: doc.event_id,
            event_type: doc.event_type,
            status: doc.status,
            retry_count: doc.retry_count,
            next_retry_at_ms: doc.next_retry_at_ms,
            user_id: doc.user_id,
            last_error: doc.last_error,
            updated_at_ms: doc.updated_at_ms,
        }));
    },
});

export const listRevenueCatEventsEligibleForRetentionPurge = query({
    args: {
        status: terminalWebhookEventStatusValidator,
        older_than_ms: v.number(),
        limit: v.number(),
    },
    handler: async (ctx, args) => {
        const safeLimit = Math.max(1, Math.min(args.limit, 500));

        const docs = await ctx.db
            .query("revenue_cat_events")
            .withIndex("by_status_and_updated_at_ms", (query) =>
                query.eq("status", args.status).lte("updated_at_ms", args.older_than_ms)
            )
            .take(safeLimit);

        return docs.map((doc) => doc._id);
    },
});

export const purgeRevenueCatEventsById = mutation({
    args: {
        event_doc_ids: v.array(v.id("revenue_cat_events")),
    },
    handler: async (ctx, args) => {
        let deletedCount = 0;

        for (const eventDocId of args.event_doc_ids) {
            const eventDoc = await ctx.db.get(eventDocId);

            if (!eventDoc) {
                continue;
            }

            if (!PROCESSED_EVENT_STATUSES.has(eventDoc.status)) {
                continue;
            }

            await ctx.db.delete(eventDocId);
            deletedCount += 1;
        }

        return {
            deleted_count: deletedCount,
        };
    },
});

export const getSubscriptionStateByUserId = query({
    args: {
        user_id: v.string(),
    },
    handler: async (ctx, args) => {
        const state = await getLatestSubscriptionStateByUserId(ctx, args.user_id);

        if (!state) {
            return null;
        }

        const billingCycleEndAtMs =
            state.billing_cycle_end_at_ms ??
            getLegacyCurrentPeriodEndAtMs(state as Record<string, unknown>);

        return {
            user_id: state.user_id,
            revenuecat_app_user_id: state.revenuecat_app_user_id,
            plan_key: state.plan_key,
            has_active_subscription: state.has_active_subscription,
            store_subscription_id: state.store_subscription_id,
            store_subscription_period_id: state.store_subscription_period_id,
            billing_cycle_end_at_ms: billingCycleEndAtMs,
            last_synced_at_ms: state.last_synced_at_ms,
            stale_after_at_ms: state.stale_after_at_ms,
        };
    },
});

export const getUserDeletionSnapshot = query({
    args: {
        user_id: v.string(),
    },
    handler: async (ctx, args) => {
        const [state, quotaPeriods] = await Promise.all([
            getLatestSubscriptionStateByUserId(ctx, args.user_id),
            listQuotaPeriodsByUserId(ctx, args.user_id),
        ]);

        if (!state) {
            return {
                has_active_subscription: false,
                revenuecat_app_user_id: undefined,
                current_quota_period_id: undefined,
                store_subscription_id: undefined,
                store_subscription_period_id: undefined,
            };
        }

        const currentQuotaPeriod = getMostRelevantQuotaPeriodForWindow(
            quotaPeriods,
            getSubscriptionWindowFromQuotaPeriodSyncSource(
                buildQuotaPeriodSyncSourceFromSubscriptionState(state)
            )
        );

        return {
            has_active_subscription: state.has_active_subscription,
            revenuecat_app_user_id: state.revenuecat_app_user_id,
            current_quota_period_id: currentQuotaPeriod?._id,
            store_subscription_id: state.store_subscription_id,
            store_subscription_period_id: state.store_subscription_period_id,
        };
    },
});

export const getUserDeletionOperationState = query({
    args: {
        user_id: v.string(),
    },
    handler: async (ctx, args) => {
        const operation = getLatestUserDeletionOperation(
            await listUserDeletionOperationsByUserId(ctx, args.user_id)
        );

        return {
            in_progress: operation !== null,
            started_at_ms: operation?.started_at_ms,
            updated_at_ms: operation?.updated_at_ms,
        };
    },
});

export const getPreparedUserDeletionContext = query({
    args: {
        user_id: v.string(),
    },
    handler: async (ctx, args) => {
        const preparations = await listUserDeletionPreparationsByUserId(ctx, args.user_id);
        const latestPreparation = getLatestUserDeletionPreparation(preparations);

        if (!latestPreparation) {
            return null;
        }

        return {
            has_active_subscription: latestPreparation.has_active_subscription,
            revenuecat_app_user_id: latestPreparation.revenuecat_app_user_id,
            preserved_quota_period_id: latestPreparation.preserved_quota_period_id,
            store_subscription_id: latestPreparation.store_subscription_id,
            store_subscription_period_id: latestPreparation.store_subscription_period_id,
        };
    },
});

export const getActiveUserDeletionUsageEventCount = query({
    args: {
        user_id: v.string(),
    },
    handler: async (ctx, args) => {
        const activeUsageEvents = await listActiveUsageEventsByUserId(ctx, args.user_id);

        return {
            active_usage_event_count: activeUsageEvents.length,
        };
    },
});

export const getUserDeletionCleanupStatus = query({
    args: {
        user_id: v.string(),
    },
    handler: async (ctx, args) => {
        const [stateDocs, quotaPeriods, usageEvents] = await Promise.all([
            listSubscriptionStatesByUserId(ctx, args.user_id),
            listQuotaPeriodsByUserId(ctx, args.user_id),
            listUsageEventsByUserId(ctx, args.user_id),
        ]);
        const latestState = [...stateDocs].sort((left, right) => right.updated_at_ms - left.updated_at_ms)[0] ?? null;
        const revenueCatEvents = await listRevenueCatEventsForUserDeletion(ctx, {
            user_id: args.user_id,
            revenuecat_app_user_id: latestState?.revenuecat_app_user_id,
        });

        return {
            has_subscription_states: stateDocs.length > 0,
            has_quota_periods: quotaPeriods.length > 0,
            has_usage_events: usageEvents.length > 0,
            has_revenue_cat_events: revenueCatEvents.length > 0,
        };
    },
});

export const listSubscriptionStatesDueForExpirationReconciliation = query({
    args: {
        now_ms: v.number(),
        limit: v.number(),
    },
    handler: async (ctx, args) => {
        const safeLimit = Math.max(1, Math.min(args.limit, 50));

        const dueStates = await ctx.db
            .query("subscription_states")
            .withIndex("by_stale_after_at_ms", (query) =>
                query.lte("stale_after_at_ms", args.now_ms)
            )
            .take(safeLimit);

        return dueStates.map((state) => ({
            user_id: state.user_id,
            revenuecat_app_user_id: state.revenuecat_app_user_id,
        }));
    },
});

export const applyReconciledSubscriptionState = mutation({
    args: {
        user_id: v.string(),
        revenuecat_app_user_id: v.string(),
        signup_at_ms: v.optional(v.number()),
        synced_at_ms: v.number(),
        expiration_reconciliation_delay_ms: v.number(),
        store_subscription_id_hint: v.optional(v.string()),
        allow_user_deletion_in_progress: v.optional(v.boolean()),
        snapshot: reconciliationSnapshotValidator,
    },
    handler: async (ctx, args) => {
        if (args.allow_user_deletion_in_progress !== true) {
            const activeDeletionOperation = getLatestUserDeletionOperation(
                await listUserDeletionOperationsByUserId(ctx, args.user_id)
            );

            if (activeDeletionOperation) {
                throw new Error("Cannot apply subscription state while user deletion is in progress");
            }
        }

        const existingState = await getLatestSubscriptionStateByUserId(ctx, args.user_id);

        const hasActiveSubscription = args.snapshot.has_active_subscription;
        const planKey: "free" | "polyglot" = hasActiveSubscription ? "polyglot" : "free";

        const reconciliationWindow =
            hasActiveSubscription &&
            typeof args.snapshot.period_start_at_ms === "number" &&
            typeof args.snapshot.period_end_at_ms === "number"
                ? getRequiredBillingCycleWindow(
                      args.snapshot.period_start_at_ms,
                      args.snapshot.period_end_at_ms
                  )
                : null;
        const nextStoreSubscriptionId = resolveNextStoreSubscriptionId({
            existingState,
            snapshot: args.snapshot,
            store_subscription_id_hint: args.store_subscription_id_hint,
        });
        const nextStoreSubscriptionPeriodId = hasActiveSubscription
            ? buildStoreSubscriptionPeriodId({
                  store: args.snapshot.store ?? existingState?.store,
                  store_subscription_id: nextStoreSubscriptionId,
                  period_start_at_ms: args.snapshot.period_start_at_ms,
              })
            : undefined;
        const restorableFrozenQuotaPeriod = hasActiveSubscription
            ? await getRestorableFrozenQuotaPeriodByStoreSubscriptionPeriodId(
                  ctx,
                  {
                      store_subscription_period_id: nextStoreSubscriptionPeriodId,
                      store: args.snapshot.store ?? existingState?.store,
                      product_id: args.snapshot.product_id ?? existingState?.product_id,
                      period_start_at_ms: args.snapshot.period_start_at_ms,
                      period_end_at_ms: args.snapshot.period_end_at_ms,
                  }
              )
            : null;

        const freePeriodAnchorAtMs = hasActiveSubscription
            ? existingState?.free_period_anchor_at_ms
            : resolveFreePeriodAnchorAtMs({
                  existingState,
                  signup_at_ms: args.signup_at_ms,
                  now_ms: args.synced_at_ms,
              });
        const resolvedWindow = hasActiveSubscription
            ? (reconciliationWindow ??
                (() => {
                    throw new Error("Active RevenueCat subscription is missing billing cycle bounds");
                })())
            : getRequiredAnchoredMonthlyWindow(freePeriodAnchorAtMs ?? args.synced_at_ms, args.synced_at_ms);
        const hasLogicalWindowChanged = existingState
            ? !isSameLogicalSubscriptionWindow(existingState, resolvedWindow)
            : true;
        const restoredTranslateChars = restorableFrozenQuotaPeriod?.translate_charged_chars ?? 0;
        const restoredRespellChars = restorableFrozenQuotaPeriod?.respell_charged_chars ?? 0;

        const nextTranslateCharsUsed = hasLogicalWindowChanged
            ? restoredTranslateChars
            : (existingState?.translate_chars_used ?? 0) + restoredTranslateChars;
        const nextRespellCharsUsed = hasLogicalWindowChanged
            ? restoredRespellChars
            : (existingState?.respell_chars_used ?? 0) + restoredRespellChars;
        const staleAfterAtMs = resolveNextExpirationReconciliationAtMs(
            hasActiveSubscription,
            args.snapshot.period_end_at_ms,
            args.expiration_reconciliation_delay_ms
        );

        const nextStateBase = {
            user_id: args.user_id,
            revenuecat_app_user_id: args.revenuecat_app_user_id,
            plan_key: planKey,
            has_active_subscription: hasActiveSubscription,
            ...(nextStoreSubscriptionId ? { store_subscription_id: nextStoreSubscriptionId } : {}),
            ...(nextStoreSubscriptionPeriodId
                ? { store_subscription_period_id: nextStoreSubscriptionPeriodId }
                : {}),
            ...(isFiniteTimestampMs(freePeriodAnchorAtMs)
                ? { free_period_anchor_at_ms: freePeriodAnchorAtMs }
                : {}),
            window_type: resolvedWindow.window_type,
            window_key: resolvedWindow.window_key,
            window_start_at_ms: resolvedWindow.window_start_at_ms,
            window_end_at_ms: resolvedWindow.window_end_at_ms,
            translate_chars_used: nextTranslateCharsUsed,
            respell_chars_used: nextRespellCharsUsed,
            last_synced_at_ms: args.synced_at_ms,
            stale_after_at_ms: staleAfterAtMs,
            created_at_ms: existingState?.created_at_ms ?? args.synced_at_ms,
            updated_at_ms: args.synced_at_ms,
        };

        const nextState = {
            ...nextStateBase,
            ...(existingState?.last_revenuecat_event_id
                ? { last_revenuecat_event_id: existingState.last_revenuecat_event_id }
                : {}),
            ...(typeof existingState?.last_revenuecat_event_at_ms === "number"
                ? { last_revenuecat_event_at_ms: existingState.last_revenuecat_event_at_ms }
                : {}),
            ...(args.snapshot.entitlement_id ? { entitlement_id: args.snapshot.entitlement_id } : {}),
            ...(args.snapshot.product_id ? { product_id: args.snapshot.product_id } : {}),
            ...(args.snapshot.store ? { store: args.snapshot.store } : {}),
            ...(args.snapshot.environment ? { environment: args.snapshot.environment } : {}),
            ...(typeof args.snapshot.period_start_at_ms === "number"
                ? { billing_cycle_start_at_ms: args.snapshot.period_start_at_ms }
                : {}),
            ...(typeof args.snapshot.period_end_at_ms === "number"
                ? { billing_cycle_end_at_ms: args.snapshot.period_end_at_ms }
                : {}),
        };
        const changeStatus = hasComparableSubscriptionStateChanged(existingState, nextState)
            ? "updated"
            : "unchanged";

        const nextPlanLimits = await resolvePlanLimitsForPlanKey(ctx, {
            plan_key: nextState.plan_key,
            now_ms: args.synced_at_ms,
        });

        if (existingState && hasLogicalWindowChanged) {
            const previousPlanLimits =
                existingState.plan_key === nextState.plan_key
                    ? nextPlanLimits
                    : await resolvePlanLimitsForPlanKey(ctx, {
                          plan_key: existingState.plan_key,
                          now_ms: args.synced_at_ms,
                      });

            await closeQuotaPeriodForSubscriptionState(ctx, {
                user_id: args.user_id,
                source: buildQuotaPeriodSyncSourceFromSubscriptionState(existingState),
                planLimits: previousPlanLimits,
                now_ms: args.synced_at_ms,
            });
        }

        if (existingState) {
            await ctx.db.replace(existingState._id, nextState);
        } else {
            await ctx.db.insert("subscription_states", nextState);
        }

        const currentQuotaPeriod = await upsertOpenQuotaPeriodDoc(ctx, {
            user_id: args.user_id,
            source: buildQuotaPeriodSyncSourceFromSubscriptionState(nextState),
            planLimits: nextPlanLimits,
            translate_chars_used: nextState.translate_chars_used ?? 0,
            respell_chars_used: nextState.respell_chars_used ?? 0,
            now_ms: args.synced_at_ms,
        });

        if (restorableFrozenQuotaPeriod) {
            await ctx.db.patch(restorableFrozenQuotaPeriod._id, {
                restored_at_ms: args.synced_at_ms,
                restored_to_quota_period_id: currentQuotaPeriod._id,
                updated_at_ms: args.synced_at_ms,
            });
        }

        return {
            status: existingState ? changeStatus : ("created" as const),
            plan_key: nextState.plan_key,
            has_active_subscription: nextState.has_active_subscription,
            billing_cycle_end_at_ms: nextState.billing_cycle_end_at_ms,
            last_synced_at_ms: nextState.last_synced_at_ms,
        };
    },
});

async function listRevenueCatEventsForUserDeletion(
    ctx: DbReaderCtx,
    args: {
        user_id: string;
        revenuecat_app_user_id?: string;
    }
) {
    const candidateAppUserIds = Array.from(
        new Set(
            [args.user_id, args.revenuecat_app_user_id].filter(
                (value): value is string => typeof value === "string" && value.length > 0
            )
        )
    );
    const eventsById = new Map<string, Doc<"revenue_cat_events">>();

    const userIdEvents = await ctx.db
        .query("revenue_cat_events")
        .withIndex("by_user_id_and_event_at_ms", (query) => query.eq("user_id", args.user_id))
        .collect();

    for (const eventDoc of userIdEvents) {
        eventsById.set(String(eventDoc._id), eventDoc);
    }

    for (const candidateAppUserId of candidateAppUserIds) {
        const [appUserEvents, originalAppUserEvents] = await Promise.all([
            ctx.db
                .query("revenue_cat_events")
                .withIndex("by_app_user_id_and_event_at_ms", (query) =>
                    query.eq("app_user_id", candidateAppUserId)
                )
                .collect(),
            ctx.db
                .query("revenue_cat_events")
                .withIndex("by_original_app_user_id_and_event_at_ms", (query) =>
                    query.eq("original_app_user_id", candidateAppUserId)
                )
                .collect(),
        ]);

        for (const eventDoc of [...appUserEvents, ...originalAppUserEvents]) {
            eventsById.set(String(eventDoc._id), eventDoc);
        }
    }

    return [...eventsById.values()];
}

export const startUserDeletionOperation = mutation({
    args: {
        user_id: v.string(),
        now_ms: v.number(),
    },
    handler: async (ctx, args) => {
        const existingOperations = await listUserDeletionOperationsByUserId(ctx, args.user_id);
        const latestOperation = getLatestUserDeletionOperation(existingOperations);
        const nextOperation = {
            user_id: args.user_id,
            started_at_ms: latestOperation?.started_at_ms ?? args.now_ms,
            updated_at_ms: args.now_ms,
        };

        const retainedOperationId = latestOperation
            ? latestOperation._id
            : await ctx.db.insert("user_deletion_operations", nextOperation);

        if (latestOperation) {
            await ctx.db.replace(retainedOperationId, nextOperation);
        }

        for (const operation of existingOperations) {
            if (operation._id === retainedOperationId) {
                continue;
            }

            await ctx.db.delete(operation._id);
        }

        return {
            in_progress: true,
            started_at_ms: nextOperation.started_at_ms,
            updated_at_ms: nextOperation.updated_at_ms,
        };
    },
});

export const clearUserDeletionOperation = mutation({
    args: {
        user_id: v.string(),
    },
    handler: async (ctx, args) => {
        const operations = await listUserDeletionOperationsByUserId(ctx, args.user_id);

        for (const operation of operations) {
            await ctx.db.delete(operation._id);
        }

        return {
            deleted_count: operations.length,
        };
    },
});

export const upsertUserDeletionPreparation = mutation({
    args: {
        user_id: v.string(),
        revenuecat_app_user_id: v.optional(v.string()),
        has_active_subscription: v.boolean(),
        preserved_quota_period_id: v.optional(v.id("quota_periods")),
        store_subscription_id: v.optional(v.string()),
        store_subscription_period_id: v.optional(v.string()),
        prepared_at_ms: v.number(),
    },
    handler: async (ctx, args) => {
        const existingPreparations = await listUserDeletionPreparationsByUserId(ctx, args.user_id);
        const latestPreparation = getLatestUserDeletionPreparation(existingPreparations);
        const nextPreparation = {
            user_id: args.user_id,
            ...(typeof args.revenuecat_app_user_id === "string"
                ? { revenuecat_app_user_id: args.revenuecat_app_user_id }
                : {}),
            has_active_subscription: args.has_active_subscription,
            ...(typeof args.preserved_quota_period_id !== "undefined"
                ? { preserved_quota_period_id: args.preserved_quota_period_id }
                : {}),
            ...(typeof args.store_subscription_id === "string"
                ? { store_subscription_id: args.store_subscription_id }
                : {}),
            ...(typeof args.store_subscription_period_id === "string"
                ? { store_subscription_period_id: args.store_subscription_period_id }
                : {}),
            prepared_at_ms: args.prepared_at_ms,
        };

        const retainedPreparationId = latestPreparation
            ? latestPreparation._id
            : await ctx.db.insert("user_deletion_preparations", nextPreparation);

        if (latestPreparation) {
            await ctx.db.replace(retainedPreparationId, nextPreparation);
        }

        for (const preparation of existingPreparations) {
            if (preparation._id === retainedPreparationId) {
                continue;
            }

            await ctx.db.delete(preparation._id);
        }

        return {
            has_active_subscription: nextPreparation.has_active_subscription,
            revenuecat_app_user_id: nextPreparation.revenuecat_app_user_id,
            preserved_quota_period_id: nextPreparation.preserved_quota_period_id,
            store_subscription_id: nextPreparation.store_subscription_id,
            store_subscription_period_id: nextPreparation.store_subscription_period_id,
        };
    },
});

export const clearUserDeletionPreparation = mutation({
    args: {
        user_id: v.string(),
    },
    handler: async (ctx, args) => {
        const preparations = await listUserDeletionPreparationsByUserId(ctx, args.user_id);

        for (const preparation of preparations) {
            await ctx.db.delete(preparation._id);
        }

        return {
            deleted_count: preparations.length,
        };
    },
});

export const deleteUserSubscriptionData = mutation({
    args: {
        user_id: v.string(),
        revenuecat_app_user_id: v.optional(v.string()),
        preserved_quota_period_id: v.optional(v.id("quota_periods")),
        now_ms: v.number(),
    },
    handler: async (ctx, args) => {
        const [quotaPeriods, usageEvents, revenueCatEvents] = await Promise.all([
            listQuotaPeriodsByUserId(ctx, args.user_id),
            listUsageEventsByUserId(ctx, args.user_id),
            listRevenueCatEventsForUserDeletion(ctx, {
                user_id: args.user_id,
                revenuecat_app_user_id: args.revenuecat_app_user_id,
            }),
        ]);

        let remainingDeletes = USER_DELETION_BATCH_LIMIT;

        const usageEventsToDelete = usageEvents.slice(0, remainingDeletes);
        for (const usageEvent of usageEventsToDelete) {
            await ctx.db.delete(usageEvent._id);
        }
        remainingDeletes -= usageEventsToDelete.length;

        const revenueCatEventsToDelete = revenueCatEvents.slice(0, remainingDeletes);
        for (const eventDoc of revenueCatEventsToDelete) {
            await ctx.db.delete(eventDoc._id);
        }
        remainingDeletes -= revenueCatEventsToDelete.length;

        let deletedQuotaPeriods = 0;
        const quotaPeriodsToDelete = quotaPeriods.filter(
            (quotaPeriod) => quotaPeriod._id !== args.preserved_quota_period_id
        );
        for (const quotaPeriod of quotaPeriodsToDelete.slice(0, remainingDeletes)) {
            await ctx.db.delete(quotaPeriod._id);
            deletedQuotaPeriods += 1;
        }
        remainingDeletes -= deletedQuotaPeriods;

        const hasRemainingDeletes =
            usageEvents.length > usageEventsToDelete.length ||
            revenueCatEvents.length > revenueCatEventsToDelete.length ||
            quotaPeriodsToDelete.length > deletedQuotaPeriods;

        return {
            preserved_quota_period_id: args.preserved_quota_period_id ?? null,
            deleted_quota_periods: deletedQuotaPeriods,
            deleted_usage_events: usageEventsToDelete.length,
            deleted_revenue_cat_events: revenueCatEventsToDelete.length,
            has_remaining: hasRemainingDeletes,
        };
    },
});

export const forceStopUserActiveUsageEvents = mutation({
    args: {
        user_id: v.string(),
        now_ms: v.number(),
    },
    handler: async (ctx, args) => {
        const activeUsageEvents = await listActiveUsageEventsByUserId(ctx, args.user_id);
        let forced_stop_count = 0;

        for (const usageEvent of activeUsageEvents) {
            const patch = buildForcedStoppedUsageEventPatch(usageEvent, args.now_ms);

            if (!patch) {
                continue;
            }

            await ctx.db.patch(usageEvent._id, patch);
            forced_stop_count += 1;
        }

        return {
            forced_stop_count,
            active_usage_event_count: activeUsageEvents.length,
        };
    },
});

export const finalizeDeletedUserSubscriptionData = mutation({
    args: {
        user_id: v.string(),
        revenuecat_app_user_id: v.optional(v.string()),
        preserved_quota_period_id: v.optional(v.id("quota_periods")),
        has_active_subscription: v.boolean(),
        store_subscription_id: v.optional(v.string()),
        store_subscription_period_id: v.optional(v.string()),
        now_ms: v.number(),
    },
    handler: async (ctx, args) => {
        const [stateDocs, quotaPeriods, usageEvents, revenueCatEvents, deletionPreparations] =
            await Promise.all([
                listSubscriptionStatesByUserId(ctx, args.user_id),
                listQuotaPeriodsByUserId(ctx, args.user_id),
                listUsageEventsByUserId(ctx, args.user_id),
                listRevenueCatEventsForUserDeletion(ctx, {
                    user_id: args.user_id,
                    revenuecat_app_user_id: args.revenuecat_app_user_id,
                }),
                listUserDeletionPreparationsByUserId(ctx, args.user_id),
            ]);
        const remainingQuotaPeriods = quotaPeriods.filter(
            (quotaPeriod) => quotaPeriod._id !== args.preserved_quota_period_id
        );

        if (usageEvents.length > 0) {
            throw new Error("Cannot finalize deletion while usage events remain");
        }

        if (revenueCatEvents.length > 0) {
            throw new Error("Cannot finalize deletion while RevenueCat events remain");
        }

        if (remainingQuotaPeriods.length > 0) {
            throw new Error("Cannot finalize deletion while quota periods remain");
        }

        let frozenQuotaPeriodId: Doc<"quota_periods">["_id"] | null = null;

        if (args.has_active_subscription) {
            if (!args.preserved_quota_period_id) {
                throw new Error("Missing preserved quota period for active subscription deletion");
            }

            const preservedQuotaPeriod = await ctx.db.get(args.preserved_quota_period_id);

            if (!preservedQuotaPeriod) {
                throw new Error("Missing preserved quota period for active subscription deletion");
            }

            await ctx.db.patch(preservedQuotaPeriod._id, {
                user_id: null,
                status: "frozen",
                ...(args.store_subscription_id
                    ? { store_subscription_id: args.store_subscription_id }
                    : {}),
                ...(args.store_subscription_period_id
                    ? {
                          store_subscription_period_id: args.store_subscription_period_id,
                      }
                    : {}),
                frozen_at_ms: args.now_ms,
                closed_at_ms: preservedQuotaPeriod.closed_at_ms ?? args.now_ms,
                restored_at_ms: undefined,
                restored_to_quota_period_id: undefined,
                updated_at_ms: args.now_ms,
            });

            frozenQuotaPeriodId = preservedQuotaPeriod._id;
        }

        for (const stateDoc of stateDocs) {
            await ctx.db.delete(stateDoc._id);
        }

        for (const deletionPreparation of deletionPreparations) {
            await ctx.db.delete(deletionPreparation._id);
        }

        return {
            frozen_quota_period_id: frozenQuotaPeriodId,
            deleted_subscription_states: stateDocs.length,
        };
    },
});

function shouldUseTimelineSafeFreeAnonymousMerge(args: {
    sourceState: Doc<"subscription_states"> | null;
    targetState: Doc<"subscription_states"> | null;
    sourceQuotaPeriods: Doc<"quota_periods">[];
}) {
    const sourceHasPaidState = args.sourceState?.has_active_subscription === true;
    const targetHasActivePaidState = args.targetState?.has_active_subscription === true;
    const sourceHasPaidQuotaPeriods = args.sourceQuotaPeriods.some(
        (quotaPeriod) => quotaPeriod.active_subscription
    );

    return !sourceHasPaidState && !targetHasActivePaidState && !sourceHasPaidQuotaPeriods;
}

async function mergeAnonymousFreeQuotaDataPreservingSourceTimeline(
    ctx: MutationCtx,
    args: {
        anonymous_user_id: string;
        user_id: string;
        now_ms: number;
        sourceState: Doc<"subscription_states"> | null;
        targetState: Doc<"subscription_states"> | null;
        sourceQuotaPeriods: Doc<"quota_periods">[];
        targetQuotaPeriods: Doc<"quota_periods">[];
        sourceUsageEvents: Doc<"usage_events">[];
        targetUsageEvents: Doc<"usage_events">[];
    }
) {
    const sourceFreePeriodAnchorAtMs = resolveCanonicalFreeAnchorAtMs({
        authority: "source",
        sourceState: args.sourceState,
        targetState: args.targetState,
        sourceQuotaPeriods: args.sourceQuotaPeriods,
        targetQuotaPeriods: args.targetQuotaPeriods,
    });

    if (!isFiniteTimestampMs(sourceFreePeriodAnchorAtMs ?? undefined)) {
        throw new Error("Cannot preserve anonymous free timeline without a canonical free anchor");
    }
    const resolvedSourceFreePeriodAnchorAtMs = sourceFreePeriodAnchorAtMs as number;

    assertFreeStateUsageIntegrity({
        state: args.sourceState,
        quotaPeriods: args.sourceQuotaPeriods,
        usageEvents: args.sourceUsageEvents,
        free_period_anchor_at_ms: resolvedSourceFreePeriodAnchorAtMs,
        now_ms: args.now_ms,
    });

    for (const sourceQuotaPeriod of args.sourceQuotaPeriods) {
        await ctx.db.patch(sourceQuotaPeriod._id, {
            user_id: args.user_id,
            updated_at_ms: args.now_ms,
        });
    }

    for (const sourceUsageEvent of args.sourceUsageEvents) {
        await ctx.db.patch(sourceUsageEvent._id, {
            user_id: args.user_id,
            updated_at_ms: args.now_ms,
        });
    }

    const mergedRevenueCatAppUserId = resolveMergedRevenueCatAppUserId(
        args.sourceState,
        args.targetState
    );
    const mergedLastRevenueCatEvent = resolveMergedLastRevenueCatEventMetadata(
        args.sourceState,
        args.targetState
    );

    await persistMergedFreeSubscriptionState(ctx, {
        sourceState: args.sourceState,
        targetState: args.targetState,
        user_id: args.user_id,
        free_period_anchor_at_ms: resolvedSourceFreePeriodAnchorAtMs,
        fallbackState: args.sourceState,
        mergedRevenueCatAppUserId,
        mergedLastRevenueCatEvent,
        now_ms: args.now_ms,
    });

    return {
        status: resolveAnonymousQuotaLinkStatus({
            sourceState: args.sourceState,
            targetState: args.targetState,
            targetQuotaPeriods: args.targetQuotaPeriods,
            targetUsageEvents: args.targetUsageEvents,
        }),
        merge_strategy: "preserved_source_free_timeline" as const,
    };
}

async function mergeAnonymousFreeQuotaDataIntoTargetTimeline(
    ctx: MutationCtx,
    args: {
        anonymous_user_id: string;
        user_id: string;
        now_ms: number;
        sourceState: Doc<"subscription_states"> | null;
        targetState: Doc<"subscription_states"> | null;
        sourceQuotaPeriods: Doc<"quota_periods">[];
        targetQuotaPeriods: Doc<"quota_periods">[];
        sourceUsageEvents: Doc<"usage_events">[];
        targetUsageEvents: Doc<"usage_events">[];
    }
) {
    const targetFreePeriodAnchorAtMs = resolvePreferredFreeAnchorAtMs({
        state: args.targetState,
        quotaPeriods: args.targetQuotaPeriods,
    });

    if (!isFiniteTimestampMs(targetFreePeriodAnchorAtMs ?? undefined)) {
        throw new Error("Cannot preserve target free timeline without a canonical target free anchor");
    }
    const resolvedTargetFreePeriodAnchorAtMs = targetFreePeriodAnchorAtMs as number;

    const sourceFreePeriodAnchorAtMs = resolvePreferredFreeAnchorAtMs({
        state: args.sourceState,
        quotaPeriods: args.sourceQuotaPeriods,
    });

    if (isFreeSubscriptionState(args.sourceState)) {
        if (!isFiniteTimestampMs(sourceFreePeriodAnchorAtMs ?? undefined)) {
            throw new Error("Cannot safely rebucket anonymous free usage without a canonical source free anchor");
        }
        const resolvedSourceFreePeriodAnchorAtMs = sourceFreePeriodAnchorAtMs as number;

        assertFreeStateUsageIntegrity({
            state: args.sourceState,
            quotaPeriods: args.sourceQuotaPeriods,
            usageEvents: args.sourceUsageEvents,
            free_period_anchor_at_ms: resolvedSourceFreePeriodAnchorAtMs,
            now_ms: args.now_ms,
        });
    }

    const sourceUsageEventsByQuotaPeriodId = buildUsageEventsByQuotaPeriodId(args.sourceUsageEvents);

    for (const sourceQuotaPeriod of args.sourceQuotaPeriods.filter(isFreeQuotaPeriodDoc)) {
        assertQuotaPeriodAppliedUsageIntegrity({
            quotaPeriod: sourceQuotaPeriod,
            usageEvents:
                sourceUsageEventsByQuotaPeriodId.get(String(sourceQuotaPeriod._id)) ?? [],
        });
    }

    const freePlanLimits = await resolvePlanLimitsForPlanKey(ctx, {
        plan_key: "free",
        now_ms: args.now_ms,
    });
    const currentTargetWindow = getRequiredAnchoredMonthlyWindow(
        resolvedTargetFreePeriodAnchorAtMs,
        args.now_ms
    );
    const mutableTargetQuotaPeriods = [...args.targetQuotaPeriods];
    const targetQuotaPeriodsById = new Map<string, Doc<"quota_periods">>(
        mutableTargetQuotaPeriods.map((quotaPeriod) => [String(quotaPeriod._id), quotaPeriod])
    );
    const targetQuotaPeriodsByWindowKey = new Map<string, Doc<"quota_periods">>();
    const appliedUsageDeltasByQuotaPeriodId = new Map<string, AppliedUsageDelta>();

    for (const sourceUsageEvent of [...args.sourceUsageEvents].sort(
        (left, right) => left.reserved_at_ms - right.reserved_at_ms
    )) {
        const targetWindow = resolveRebucketedFreeUsageWindow({
            free_period_anchor_at_ms: resolvedTargetFreePeriodAnchorAtMs,
            event: sourceUsageEvent,
        });
        const targetQuotaPeriod = await resolveOrCreateFreeQuotaPeriodForWindow(ctx, {
            user_id: args.user_id,
            window: targetWindow,
            currentWindow: currentTargetWindow,
            planLimits: freePlanLimits,
            quotaPeriods: mutableTargetQuotaPeriods,
            quotaPeriodsById: targetQuotaPeriodsById,
            quotaPeriodsByWindowKey: targetQuotaPeriodsByWindowKey,
            now_ms: args.now_ms,
        });
        const usageEventPatch: MutableUsageEventFields = {
            user_id: args.user_id,
            updated_at_ms: args.now_ms,
        };

        if (targetQuotaPeriod._id !== sourceUsageEvent.quota_period_id) {
            usageEventPatch.quota_period_id = targetQuotaPeriod._id;
        }

        await ctx.db.patch(sourceUsageEvent._id, usageEventPatch);
        accumulateAppliedUsageDelta(
            appliedUsageDeltasByQuotaPeriodId,
            sourceUsageEvent,
            targetQuotaPeriod._id
        );
    }

    await applyAppliedUsageDeltasToQuotaPeriods(ctx, {
        quotaPeriodsById: targetQuotaPeriodsById,
        appliedUsageDeltasByQuotaPeriodId,
        now_ms: args.now_ms,
    });

    for (const sourceQuotaPeriod of args.sourceQuotaPeriods) {
        await ctx.db.delete(sourceQuotaPeriod._id);
    }

    const mergedRevenueCatAppUserId = resolveMergedRevenueCatAppUserId(
        args.sourceState,
        args.targetState
    );
    const mergedLastRevenueCatEvent = resolveMergedLastRevenueCatEventMetadata(
        args.sourceState,
        args.targetState
    );

    await persistMergedFreeSubscriptionState(ctx, {
        sourceState: args.sourceState,
        targetState: args.targetState,
        user_id: args.user_id,
        free_period_anchor_at_ms: resolvedTargetFreePeriodAnchorAtMs,
        fallbackState: args.targetState,
        mergedRevenueCatAppUserId,
        mergedLastRevenueCatEvent,
        now_ms: args.now_ms,
    });

    return {
        status: resolveAnonymousQuotaLinkStatus({
            sourceState: args.sourceState,
            targetState: args.targetState,
            targetQuotaPeriods: args.targetQuotaPeriods,
            targetUsageEvents: args.targetUsageEvents,
        }),
        merge_strategy: "rebucketed_into_target_free_timeline" as const,
        rebucketed_usage_events: args.sourceUsageEvents.length,
    };
}

async function mergeAnonymousQuotaDataIntoUser(
    ctx: MutationCtx,
    args: {
        anonymous_user_id: string;
        user_id: string;
        now_ms: number;
    }
) {
    const [sourceState, targetState, sourceQuotaPeriods, targetQuotaPeriods, sourceUsageEvents, targetUsageEvents] =
        await Promise.all([
            getLatestSubscriptionStateByUserId(ctx, args.anonymous_user_id),
            getLatestSubscriptionStateByUserId(ctx, args.user_id),
            listQuotaPeriodsByUserId(ctx, args.anonymous_user_id),
            listQuotaPeriodsByUserId(ctx, args.user_id),
            listUsageEventsByUserId(ctx, args.anonymous_user_id),
            listUsageEventsByUserId(ctx, args.user_id),
        ]);

    const hasSourceData =
        sourceState !== null || sourceQuotaPeriods.length > 0 || sourceUsageEvents.length > 0;

    if (!hasSourceData) {
        return {
            status: "missing_source_data" as const,
        };
    }

    if (
        shouldUseTimelineSafeFreeAnonymousMerge({
            sourceState,
            targetState,
            sourceQuotaPeriods,
        })
    ) {
        const freeMergeAuthority = resolveAnonymousFreeMergeAuthority({
            targetState,
            targetQuotaPeriods,
            targetUsageEvents,
        });

        if (freeMergeAuthority === "source") {
            return mergeAnonymousFreeQuotaDataPreservingSourceTimeline(ctx, {
                ...args,
                sourceState,
                targetState,
                sourceQuotaPeriods,
                targetQuotaPeriods,
                sourceUsageEvents,
                targetUsageEvents,
            });
        }

        return mergeAnonymousFreeQuotaDataIntoTargetTimeline(ctx, {
            ...args,
            sourceState,
            targetState,
            sourceQuotaPeriods,
            targetQuotaPeriods,
            sourceUsageEvents,
            targetUsageEvents,
        });
    }

    const targetQuotaPeriodsByIdentity = new Map<string, Doc<"quota_periods">>();
    for (const targetQuotaPeriod of [...targetQuotaPeriods].sort(
        (left, right) => right.updated_at_ms - left.updated_at_ms
    )) {
        if (!isReusableQuotaPeriod(targetQuotaPeriod)) {
            continue;
        }

        const identity = getQuotaPeriodMergeIdentity(targetQuotaPeriod);

        if (!targetQuotaPeriodsByIdentity.has(identity)) {
            targetQuotaPeriodsByIdentity.set(identity, targetQuotaPeriod);
        }
    }

    const sourceQuotaPeriodIdRemap = new Map<Doc<"quota_periods">["_id"], Doc<"quota_periods">["_id"]>();

    for (const sourceQuotaPeriod of sourceQuotaPeriods) {
        const sourceIdentity = getQuotaPeriodMergeIdentity(sourceQuotaPeriod);
        const matchingTargetQuotaPeriod = targetQuotaPeriodsByIdentity.get(sourceIdentity);

        if (!matchingTargetQuotaPeriod) {
            await ctx.db.patch(sourceQuotaPeriod._id, {
                user_id: args.user_id,
                updated_at_ms: args.now_ms,
            });
            sourceQuotaPeriodIdRemap.set(sourceQuotaPeriod._id, sourceQuotaPeriod._id);
            targetQuotaPeriodsByIdentity.set(sourceIdentity, {
                ...sourceQuotaPeriod,
                user_id: args.user_id,
                updated_at_ms: args.now_ms,
            });
            continue;
        }

        sourceQuotaPeriodIdRemap.set(sourceQuotaPeriod._id, matchingTargetQuotaPeriod._id);

        const quotaPeriodPatch: MutableQuotaPeriodFields = {
            translate_charged_chars:
                matchingTargetQuotaPeriod.translate_charged_chars + sourceQuotaPeriod.translate_charged_chars,
            respell_charged_chars:
                matchingTargetQuotaPeriod.respell_charged_chars + sourceQuotaPeriod.respell_charged_chars,
            updated_at_ms: args.now_ms,
        };

        if (sourceQuotaPeriod.status === "open" && matchingTargetQuotaPeriod.status !== "open") {
            quotaPeriodPatch.status = "open";
            quotaPeriodPatch.closed_at_ms = undefined;
        }

        if (
            typeof sourceQuotaPeriod.last_charged_at_ms === "number" &&
            (typeof matchingTargetQuotaPeriod.last_charged_at_ms !== "number" ||
                sourceQuotaPeriod.last_charged_at_ms > matchingTargetQuotaPeriod.last_charged_at_ms)
        ) {
            quotaPeriodPatch.last_charged_at_ms = sourceQuotaPeriod.last_charged_at_ms;
        }

        await ctx.db.patch(matchingTargetQuotaPeriod._id, quotaPeriodPatch);

        targetQuotaPeriodsByIdentity.set(sourceIdentity, {
            ...matchingTargetQuotaPeriod,
            ...quotaPeriodPatch,
        });
        await ctx.db.delete(sourceQuotaPeriod._id);
    }

    const seenUsageEventIds = new Set<string>();
    for (const usageEvent of [...sourceUsageEvents, ...targetUsageEvents]) {
        const usageEventId = String(usageEvent._id);
        if (seenUsageEventIds.has(usageEventId)) {
            continue;
        }
        seenUsageEventIds.add(usageEventId);

        if (usageEvent.user_id !== args.anonymous_user_id) {
            continue;
        }

        const nextQuotaPeriodId = sourceQuotaPeriodIdRemap.get(usageEvent.quota_period_id) ?? usageEvent.quota_period_id;
        const usageEventPatch: MutableUsageEventFields = {
            user_id: args.user_id,
            updated_at_ms: args.now_ms,
        };

        if (nextQuotaPeriodId !== usageEvent.quota_period_id) {
            usageEventPatch.quota_period_id = nextQuotaPeriodId;
        }

        await ctx.db.patch(usageEvent._id, usageEventPatch);
    }

    const mergedTargetQuotaPeriods = await listQuotaPeriodsByUserId(ctx, args.user_id);

    if (sourceState || targetState) {
        const preferredState = selectPreferredLinkedSubscriptionState(sourceState, targetState);
        const fallbackQuotaPeriodForStateSummary =
            preferredState?.has_active_subscription === true
                ? getMostRelevantQuotaPeriodForStateSummary(
                      mergedTargetQuotaPeriods.filter(
                          (quotaPeriod) =>
                              doesQuotaPeriodMatchPreferredStatePeriod(
                                  quotaPeriod,
                                  preferredState.window_key,
                                  preferredState.store_subscription_period_id
                              )
                      )
                  )
                : getMostRelevantQuotaPeriodForStateSummary(mergedTargetQuotaPeriods);
        const preferredWindowKey =
            fallbackQuotaPeriodForStateSummary?.window_key ?? preferredState?.window_key;
        const preferredStoreSubscriptionPeriodId =
            fallbackQuotaPeriodForStateSummary?.store_subscription_period_id ??
            preferredState?.store_subscription_period_id;
        const mergedUsageCounters = resolveMergedStateUsageCounters(
            preferredWindowKey,
            preferredStoreSubscriptionPeriodId,
            sourceState,
            targetState,
            sourceQuotaPeriods,
            targetQuotaPeriods,
            mergedTargetQuotaPeriods
        );
        const mergedFreePeriodAnchorAtMs = resolveMergedFreePeriodAnchorAtMs(sourceState, targetState);
        const mergedRevenueCatAppUserId = resolveMergedRevenueCatAppUserId(sourceState, targetState);
        const mergedLastRevenueCatEvent = resolveMergedLastRevenueCatEventMetadata(sourceState, targetState);

        if (preferredState) {
            const nextState = {
                ...preferredState,
                user_id: args.user_id,
                ...(fallbackQuotaPeriodForStateSummary && preferredState?.has_active_subscription !== true
                    ? {
                          window_type: fallbackQuotaPeriodForStateSummary.window_type,
                          window_key: fallbackQuotaPeriodForStateSummary.window_key,
                          window_start_at_ms: fallbackQuotaPeriodForStateSummary.period_start_at_ms,
                          window_end_at_ms: fallbackQuotaPeriodForStateSummary.period_end_at_ms,
                          plan_key: fallbackQuotaPeriodForStateSummary.plan_key,
                          has_active_subscription: fallbackQuotaPeriodForStateSummary.active_subscription,
                          ...(fallbackQuotaPeriodForStateSummary.active_subscription
                              ? {
                                    billing_cycle_start_at_ms:
                                        fallbackQuotaPeriodForStateSummary.period_start_at_ms,
                                    billing_cycle_end_at_ms:
                                        fallbackQuotaPeriodForStateSummary.period_end_at_ms,
                                }
                              : {}),
                          ...(fallbackQuotaPeriodForStateSummary.store_subscription_id
                              ? {
                                    store_subscription_id:
                                        fallbackQuotaPeriodForStateSummary.store_subscription_id,
                                }
                              : {}),
                          ...(fallbackQuotaPeriodForStateSummary.store_subscription_period_id
                              ? {
                                    store_subscription_period_id:
                                        fallbackQuotaPeriodForStateSummary.store_subscription_period_id,
                                }
                              : {}),
                          ...(fallbackQuotaPeriodForStateSummary.entitlement_id
                              ? { entitlement_id: fallbackQuotaPeriodForStateSummary.entitlement_id }
                              : {}),
                          ...(fallbackQuotaPeriodForStateSummary.product_id
                              ? { product_id: fallbackQuotaPeriodForStateSummary.product_id }
                              : {}),
                          ...(fallbackQuotaPeriodForStateSummary.store
                              ? { store: fallbackQuotaPeriodForStateSummary.store }
                              : {}),
                          ...(fallbackQuotaPeriodForStateSummary.environment
                              ? { environment: fallbackQuotaPeriodForStateSummary.environment }
                              : {}),
                      }
                    : {}),
                ...(mergedRevenueCatAppUserId
                    ? { revenuecat_app_user_id: mergedRevenueCatAppUserId }
                    : {}),
                ...(isFiniteTimestampMs(mergedFreePeriodAnchorAtMs)
                    ? { free_period_anchor_at_ms: mergedFreePeriodAnchorAtMs }
                    : {}),
                ...(mergedLastRevenueCatEvent.last_revenuecat_event_id
                    ? { last_revenuecat_event_id: mergedLastRevenueCatEvent.last_revenuecat_event_id }
                    : {}),
                ...(typeof mergedLastRevenueCatEvent.last_revenuecat_event_at_ms === "number"
                    ? {
                          last_revenuecat_event_at_ms:
                              mergedLastRevenueCatEvent.last_revenuecat_event_at_ms,
                      }
                    : {}),
                translate_chars_used: mergedUsageCounters.translateCharsUsed,
                respell_chars_used: mergedUsageCounters.respellCharsUsed,
                created_at_ms: Math.min(
                    sourceState?.created_at_ms ?? preferredState.created_at_ms,
                    targetState?.created_at_ms ?? preferredState.created_at_ms
                ),
                updated_at_ms: args.now_ms,
            };

            if (targetState) {
                const { _id: _, _creationTime: __, ...stateDocument } = nextState;
                await ctx.db.replace(targetState._id, stateDocument);
            } else if (sourceState) {
                const { _id: _, _creationTime: __, ...stateDocument } = nextState;
                await ctx.db.replace(sourceState._id, stateDocument);
            }

            if (sourceState && targetState && sourceState._id !== targetState._id) {
                await ctx.db.delete(sourceState._id);
            }
        }
    }

    return {
        status: resolveAnonymousQuotaLinkStatus({
            sourceState,
            targetState,
            targetQuotaPeriods,
            targetUsageEvents,
        }),
    } as const;
}

export const linkAnonymousSubscriptionStateToUser = mutation({
    args: {
        anonymous_user_id: v.string(),
        user_id: v.string(),
        now_ms: v.number(),
    },
    handler: async (ctx, args) => {
        if (args.anonymous_user_id === args.user_id) {
            return {
                status: "skipped_same_user",
            };
        }

        return mergeAnonymousQuotaDataIntoUser(ctx, args);
    },
});

export const deferSubscriptionStateReconciliation = mutation({
    args: {
        user_id: v.string(),
        next_attempt_at_ms: v.number(),
    },
    handler: async (ctx, args) => {
        const existingState = await getLatestSubscriptionStateByUserId(ctx, args.user_id);

        if (!existingState) {
            return {
                status: "missing",
            };
        }

        await ctx.db.patch(existingState._id, {
            stale_after_at_ms: args.next_attempt_at_ms,
            updated_at_ms: args.next_attempt_at_ms,
        });

        return {
            status: "deferred",
        };
    },
});
