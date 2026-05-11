import { v } from "convex/values";

import { api } from "./_generated/api";
import {
    mutation,
    query,
    type MutationCtx,
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
import {
    buildUsageEventQuotaAppliedPatch,
    shouldApplyUsageEventChargeBeforeDeletion,
} from "./usageEventChargeApplication";
import { shouldBlockQuotaUsageForPeriod } from "./quotaAvailability";
import {
    INPUT_CHARACTERS_QUOTA_UNIT,
    addQuotaPeriodUsageSnapshotUnits,
    applyQuotaPeriodCounterCharge,
    copyQuotaPeriodCountersToQuotaPeriod,
    createZeroQuotaPeriodUsageSnapshot,
    deleteQuotaPeriodCountersByQuotaPeriodId,
    getOrCreateQuotaPeriodCounter,
    mergeQuotaPeriodCountersIntoTarget,
    resolveQuotaCounterReservationSnapshot,
    resolveQuotaPeriodCounterLimits,
    resolveQuotaPeriodCounterUsageSummary,
    resolveQuotaPeriodUsageSnapshotFromCounters,
    shouldRejectQuotaInputBeforeCounterCreation,
    syncExistingQuotaPeriodCountersForPlanLimits,
} from "./quotaPeriodCounters";
import { canTransitionUsageEventToAfterChargeTerminalState } from "./usageEventTransitions";
import { resolveForcedStoppedUsageEventTransition } from "./userDeletionUsageEvents";
import {
    canAcquireUserDeletionOperation,
    doesUserDeletionStatusAllowAutomaticRetry,
    doesUserDeletionStatusBlockProcessing,
    doesUserDeletionStatusBlockRevenueCatReconciliation,
    resolveAuthDeletedUserDeletionContext,
    USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS,
    USER_DELETION_LATE_AUTH_WAIT_STATUS,
} from "../userDeletionQueue";
import {
    isAnonymousRevenueCatAppUserId,
    normalizeRevenueCatWebhookUserIds as normalizeRevenueCatEventUserIds,
    resolveRevenueCatWebhookTargetUserIds as resolveTargetUserIdsFromRevenueCatEvent,
} from "./revenueCatWebhookIngestion";
import {
    deleteRevenueCatEventUsersByEventDocId,
    listRevenueCatEventUsersByEventDocId,
    summarizeRevenueCatEventUserState,
} from "./revenueCatEventUserDocuments";
import {
    getLatestSubscriptionStateByUserId,
    listActiveUsageEventsByUserId,
    listQuotaPeriodsByUserId,
    listQuotaPeriodsByUserIdBatch,
    listSubscriptionStatesByUserId,
    listUsageEventsByUserId,
    listUsageEventsByUserIdBatch,
    type DbReaderCtx,
} from "./documents";
import {
    resolveOperationLimits,
    resolvePlanLimitsForPlanKey,
    subscriptionPlanLimitInputValidator,
    subscriptionUsageOperationValidator,
    type SubscriptionPlanKey,
    type SubscriptionPlanLimits,
    type SubscriptionUsageOperation,
} from "./planLimits";
import {
    buildUserDeletionQueueEntry,
    getLatestUserDeletionQueueEntryByUserId,
    listUserDeletionQueueEntriesByUserId,
    replaceUserDeletionQueueEntry,
} from "./userDeletionQueueDocuments";
import {
    deleteOrPruneRevenueCatEventForDeletedUser,
    listRevenueCatEventsForUserDeletionBatch,
} from "./userDeletionRevenueCatEvents";

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
type MutableRevenueCatEventFields = Partial<
    Omit<Doc<"revenue_cat_events">, "_id" | "_creationTime">
>;
type MutableUsageEventFields = Partial<Omit<Doc<"usage_events">, "_id" | "_creationTime">>;
const userDeletionQueueStatusValidator = v.union(
    v.literal("preparing"),
    v.literal("awaiting_auth_delete"),
    v.literal(USER_DELETION_LATE_AUTH_WAIT_STATUS),
    v.literal(USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS),
    v.literal("ready_for_cleanup"),
    v.literal("waiting_for_quiescence"),
    v.literal("retryable_error"),
    v.literal("cleanup_in_progress")
);

const BEFORE_CHARGE_USAGE_EVENT_STATES = new Set([
    "failed_before_charge",
    "user_stopped_before_charge",
]);

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

async function getMostRelevantQuotaPeriodForWindow(
    ctx: DbReaderCtx,
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

    const usageSummariesByQuotaPeriodId = new Map(
        await Promise.all(
            logicalMatches.map(async (quotaPeriod) => [
                String(quotaPeriod._id),
                await resolveQuotaPeriodCounterUsageSummary(ctx, quotaPeriod._id),
            ] as const)
        )
    );

    return (
        [...logicalMatches].sort((left, right) => {
            if (left.status !== right.status) {
                return left.status === "open" ? -1 : 1;
            }

            const leftUsageSummary = usageSummariesByQuotaPeriodId.get(String(left._id)) ?? {
                chargedUnits: 0,
                lastChargedAtMs: 0,
            };
            const rightUsageSummary = usageSummariesByQuotaPeriodId.get(String(right._id)) ?? {
                chargedUnits: 0,
                lastChargedAtMs: 0,
            };
            const leftChargedChars = leftUsageSummary.chargedUnits;
            const rightChargedChars = rightUsageSummary.chargedUnits;

            if (leftChargedChars !== rightChargedChars) {
                return rightChargedChars - leftChargedChars;
            }

            const leftLastChargedAtMs = leftUsageSummary.lastChargedAtMs;
            const rightLastChargedAtMs = rightUsageSummary.lastChargedAtMs;

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
        existingState.billing_cycle_start_at_ms ?? existingState.window_start_at_ms;
    const billingCycleEndAtMs =
        existingState.billing_cycle_end_at_ms ?? existingState.window_end_at_ms;

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
        args.existingState?.billing_cycle_end_at_ms ?? args.existingState?.window_end_at_ms;
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

async function getUserDeletionSnapshotRecordByUserId(ctx: DbReaderCtx, userId: string) {
    const [state, quotaPeriods] = await Promise.all([
        getLatestSubscriptionStateByUserId(ctx, userId),
        listQuotaPeriodsByUserId(ctx, userId),
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

    const currentQuotaPeriod = await getMostRelevantQuotaPeriodForWindow(
        ctx,
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
}

async function getRestorableFrozenQuotaPeriodByStoreSubscriptionPeriodId(
    ctx: MutationCtx,
    args: {
        store_subscription_period_id?: string;
        store_subscription_id?: string;
        store?: string;
        period_start_at_ms?: number;
        period_end_at_ms?: number;
    }
) {
    const selectBestRestorableQuotaPeriod = async (quotaPeriods: Doc<"quota_periods">[]) => {
        const usageSummariesByQuotaPeriodId = new Map(
            await Promise.all(
                quotaPeriods.map(async (quotaPeriod) => [
                    String(quotaPeriod._id),
                    await resolveQuotaPeriodCounterUsageSummary(ctx, quotaPeriod._id),
                ] as const)
            )
        );

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

                    const leftChargedChars =
                        usageSummariesByQuotaPeriodId.get(String(left._id))?.chargedUnits ?? 0;
                    const rightChargedChars =
                        usageSummariesByQuotaPeriodId.get(String(right._id))?.chargedUnits ?? 0;

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
        const exactMatch = await selectBestRestorableQuotaPeriod(quotaPeriods);

        if (exactMatch) {
            return exactMatch;
        }
    }

    if (
        typeof args.period_start_at_ms !== "number" ||
        typeof args.store_subscription_id !== "string"
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
        fallbackCandidates.filter((quotaPeriod) => {
            // Product ids are shared across users, so only subscription-level identity is safe here.
            if (quotaPeriod.store_subscription_id !== args.store_subscription_id) {
                return false;
            }

            if (typeof args.store === "string" && quotaPeriod.store !== args.store) {
                return false;
            }

            return (
                typeof args.period_end_at_ms !== "number" ||
                quotaPeriod.period_end_at_ms === args.period_end_at_ms
            );
        })
    );
}

function getLogicalQuotaPeriodWindow(
    quotaPeriod: Pick<
        Doc<"quota_periods">,
        "window_key" | "window_type" | "period_start_at_ms" | "store_subscription_period_id"
    >
) {
    return {
        window_key: quotaPeriod.window_key,
        window_type: quotaPeriod.window_type,
        window_start_at_ms: quotaPeriod.period_start_at_ms,
        ...(quotaPeriod.store_subscription_period_id
            ? { store_subscription_period_id: quotaPeriod.store_subscription_period_id }
            : {}),
    };
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

type AppliedUsageDelta = {
    quotaPeriodId: Doc<"quota_periods">["_id"];
    operation: SubscriptionUsageOperation;
    chargedUnits: number;
    lastAppliedAtMs?: number;
};

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
    const usageCounters = createZeroQuotaPeriodUsageSnapshot();

    for (const usageEvent of usageEvents) {
        const appliedUnits = resolveAppliedUsageEventUnits(usageEvent);

        if (appliedUnits <= 0) {
            continue;
        }

        addQuotaPeriodUsageSnapshotUnits(usageCounters, usageEvent.operation, appliedUnits);
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

async function assertQuotaPeriodAppliedUsageIntegrity(
    ctx: DbReaderCtx,
    args: {
        quotaPeriod: Doc<"quota_periods">;
        usageEvents: Doc<"usage_events">[];
    }
) {
    const appliedUsageCounters = sumAppliedUsageEvents(args.usageEvents);
    const quotaPeriodUsageCounters = await resolveQuotaPeriodUsageSnapshotFromCounters(
        ctx,
        args.quotaPeriod._id
    );

    if (
        quotaPeriodUsageCounters.translateCharsUsed !== appliedUsageCounters.translateCharsUsed ||
        quotaPeriodUsageCounters.respellCharsUsed !== appliedUsageCounters.respellCharsUsed
    ) {
        throw new Error(
            `Cannot safely merge quota period ${String(args.quotaPeriod._id)} because applied usage events do not match stored charged counters`
        );
    }
}

async function assertFreeStateUsageIntegrity(
    ctx: DbReaderCtx,
    args: {
        state: Doc<"subscription_states"> | null;
        quotaPeriods: Doc<"quota_periods">[];
        usageEvents: Doc<"usage_events">[];
        free_period_anchor_at_ms: number;
        now_ms: number;
    }
) {
    if (!isFreeSubscriptionState(args.state)) {
        return;
    }

    const currentWindow = getRequiredAnchoredMonthlyWindow(
        args.free_period_anchor_at_ms,
        args.now_ms
    );
    const currentQuotaPeriod = await getMostRelevantQuotaPeriodForWindow(
        ctx,
        args.quotaPeriods.filter(isFreeQuotaPeriodDoc),
        currentWindow
    );

    if (currentQuotaPeriod) {
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
        appliedUsageSnapshot.translateCharsUsed > 0 ||
        appliedUsageSnapshot.respellCharsUsed > 0
    ) {
        throw new Error(
            "Cannot safely merge free subscription state because current window usage is not backed by quota periods"
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

    const existingQuotaPeriod = await getMostRelevantQuotaPeriodForWindow(
        ctx,
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
        }),
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
    appliedUsageDeltasByCounterKey: Map<string, AppliedUsageDelta>,
    usageEvent: Doc<"usage_events">,
    quotaPeriodId: Doc<"quota_periods">["_id"]
) {
    const appliedUnits = resolveAppliedUsageEventUnits(usageEvent);

    if (appliedUnits <= 0) {
        return;
    }

    const quotaPeriodKey = `${String(quotaPeriodId)}:${usageEvent.operation}`;
    const existingDelta =
        appliedUsageDeltasByCounterKey.get(quotaPeriodKey) ?? {
            quotaPeriodId,
            operation: usageEvent.operation,
            chargedUnits: 0,
        };

    existingDelta.chargedUnits += appliedUnits;

    const nextAppliedAtMs =
        usageEvent.quota_applied_at_ms ?? usageEvent.charged_at_ms ?? usageEvent.reserved_at_ms;

    if (
        typeof nextAppliedAtMs === "number" &&
        (typeof existingDelta.lastAppliedAtMs !== "number" ||
            nextAppliedAtMs > existingDelta.lastAppliedAtMs)
    ) {
        existingDelta.lastAppliedAtMs = nextAppliedAtMs;
    }

    appliedUsageDeltasByCounterKey.set(quotaPeriodKey, existingDelta);
}

async function applyAppliedUsageDeltasToQuotaPeriodCounters(
    ctx: MutationCtx,
    args: {
        quotaPeriodsById: Map<string, Doc<"quota_periods">>;
        appliedUsageDeltasByCounterKey: Map<string, AppliedUsageDelta>;
        planLimits: SubscriptionPlanLimits;
        now_ms: number;
    }
) {
    for (const appliedUsageDelta of args.appliedUsageDeltasByCounterKey.values()) {
        const quotaPeriodKey = String(appliedUsageDelta.quotaPeriodId);
        const targetQuotaPeriod = args.quotaPeriodsById.get(quotaPeriodKey);

        if (!targetQuotaPeriod) {
            throw new Error(`Missing target quota period ${quotaPeriodKey} while applying rebucketed usage`);
        }

        const limits = resolveQuotaPeriodCounterLimits(appliedUsageDelta.operation, args.planLimits);
        const counter = await getOrCreateQuotaPeriodCounter(ctx, {
            quota_period_id: appliedUsageDelta.quotaPeriodId,
            operation: appliedUsageDelta.operation,
            quota_unit: INPUT_CHARACTERS_QUOTA_UNIT,
            input_limit: limits.input_limit,
            period_limit: limits.period_limit,
            now_ms: args.now_ms,
        });
        const lastChargedAtMs =
            typeof appliedUsageDelta.lastAppliedAtMs === "number"
                ? typeof counter.last_charged_at_ms === "number"
                    ? Math.max(counter.last_charged_at_ms, appliedUsageDelta.lastAppliedAtMs)
                    : appliedUsageDelta.lastAppliedAtMs
                : counter.last_charged_at_ms;

        await ctx.db.patch(counter._id, {
            charged_units: counter.charged_units + appliedUsageDelta.chargedUnits,
            last_charged_at_ms: lastChargedAtMs,
            updated_at_ms: args.now_ms,
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
    const preferredQuotaPeriod = await getMostRelevantQuotaPeriodForWindow(
        ctx,
        targetQuotaPeriods.filter(isFreeQuotaPeriodDoc),
        currentWindow
    );
    const currentQuotaPeriod = await upsertOpenQuotaPeriodDoc(ctx, {
        user_id: args.user_id,
        source: buildFreeQuotaPeriodSyncSource(currentWindow),
        planLimits,
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

function buildQuotaPeriodBaseDocument(args: {
    user_id: string | null;
    source: QuotaPeriodSyncSource;
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
    const currentQuotaPeriod = await getMostRelevantQuotaPeriodForWindow(
        ctx,
        quotaPeriods,
        currentWindow
    );

    if (!currentQuotaPeriod) {
        return null;
    }

    const quotaPeriodBaseDocument = buildQuotaPeriodBaseDocument({
        user_id: args.user_id,
        source: args.source,
    });
    const patch = buildQuotaPeriodPatch(currentQuotaPeriod, quotaPeriodBaseDocument, {
        status: "closed",
        closed_at_ms: args.now_ms,
        now_ms: args.now_ms,
    });

    if (patch) {
        await ctx.db.patch(currentQuotaPeriod._id, patch);
    }

    await syncExistingQuotaPeriodCountersForPlanLimits(ctx, {
        quota_period_id: currentQuotaPeriod._id,
        planLimits: args.planLimits,
        now_ms: args.now_ms,
    });

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
        initial_counter_source_quota_period_id?: Doc<"quota_periods">["_id"];
        preferred_quota_period_id?: Doc<"quota_periods">["_id"];
        now_ms: number;
    }
): Promise<Doc<"quota_periods">> {
    const quotaPeriods = await listQuotaPeriodsByUserId(ctx, args.user_id);
    const currentWindow = getSubscriptionWindowFromQuotaPeriodSyncSource(args.source);
    const currentQuotaPeriod = await getMostRelevantQuotaPeriodForWindow(
        ctx,
        quotaPeriods,
        currentWindow,
        args.preferred_quota_period_id
    );
    const quotaPeriodBaseDocument = buildQuotaPeriodBaseDocument({
        user_id: args.user_id,
        source: args.source,
    });

    if (currentQuotaPeriod) {
        const patch = buildQuotaPeriodPatch(currentQuotaPeriod, quotaPeriodBaseDocument, {
            status: "open",
            now_ms: args.now_ms,
        });

        if (patch) {
            await ctx.db.patch(currentQuotaPeriod._id, patch);
        }

        await syncExistingQuotaPeriodCountersForPlanLimits(ctx, {
            quota_period_id: currentQuotaPeriod._id,
            planLimits: args.planLimits,
            now_ms: args.now_ms,
        });

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

    if (args.initial_counter_source_quota_period_id) {
        await copyQuotaPeriodCountersToQuotaPeriod(ctx, {
            source_quota_period_id: args.initial_counter_source_quota_period_id,
            target_quota_period_id: insertedQuotaPeriod._id,
            planLimits: args.planLimits,
            now_ms: args.now_ms,
        });
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
        now_ms: args.now_ms,
    });
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

async function applyUsageEventChargeToResolvedQuotaPeriod(
    ctx: MutationCtx,
    args: {
        usageEvent: Doc<"usage_events">;
        charged_units: number;
        now_ms: number;
        target_quota_period_id?: Doc<"quota_periods">["_id"];
    }
) {
    const quotaPeriod = await ctx.db.get(args.target_quota_period_id ?? args.usageEvent.quota_period_id);

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
    const planLimits = await resolvePlanLimitsForPlanKey(ctx, {
        plan_key: quotaPeriod.plan_key,
        now_ms: args.now_ms,
    });
    const limits = resolveQuotaPeriodCounterLimits(usageEventOperation, planLimits);
    const quotaPeriodCounter = await getOrCreateQuotaPeriodCounter(ctx, {
        quota_period_id: quotaPeriod._id,
        operation: usageEventOperation,
        quota_unit: args.usageEvent.quota_unit,
        input_limit: limits.input_limit,
        period_limit: limits.period_limit,
        now_ms: args.now_ms,
    });

    await applyQuotaPeriodCounterCharge(ctx, {
        counter: quotaPeriodCounter,
        charged_units: chargedUnits,
        now_ms: args.now_ms,
    });

    return {
        status: "applied" as const,
        charged_units: chargedUnits,
    };
}

async function applyPendingUsageEventChargeToQuotaPeriod(
    ctx: MutationCtx,
    args: {
        usageEvent: Doc<"usage_events">;
        now_ms: number;
        target_quota_period_id?: Doc<"quota_periods">["_id"];
    }
) {
    if (typeof args.usageEvent.quota_applied_at_ms === "number") {
        return {
            status: "already_applied" as const,
            state: args.usageEvent.state,
        };
    }

    if (!isUsageEventCharged(args.usageEvent)) {
        return {
            status: "not_charged" as const,
            state: args.usageEvent.state,
        };
    }

    const chargedUnits = resolveHeldUsageEventUnits(args.usageEvent);
    const applyResult = await applyUsageEventChargeToResolvedQuotaPeriod(ctx, {
        usageEvent: args.usageEvent,
        charged_units: chargedUnits,
        now_ms: args.now_ms,
        target_quota_period_id: args.target_quota_period_id,
    });

    if (applyResult.status !== "applied") {
        return applyResult;
    }

    const patch = buildUsageEventQuotaAppliedPatch({
        state: args.usageEvent.state,
        charged_units: chargedUnits,
        charged_at_ms: args.usageEvent.charged_at_ms,
        now_ms: args.now_ms,
    });

    await ctx.db.patch(args.usageEvent._id, patch);

    return {
        status: "applied" as const,
        charged_units: chargedUnits,
        state: patch.state ?? args.usageEvent.state,
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

    if (
        shouldRejectQuotaInputBeforeCounterCreation({
            input_char_count: sanitizedInputCharCount,
            input_limit: quotaContext.operationLimits.input_limit,
        })
    ) {
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
    const quotaPeriodCounter = await getOrCreateQuotaPeriodCounter(ctx, {
        quota_period_id: quotaPeriod._id,
        operation: args.operation,
        quota_unit: INPUT_CHARACTERS_QUOTA_UNIT,
        input_limit: quotaContext.operationLimits.input_limit,
        period_limit: quotaContext.operationLimits.period_limit,
        now_ms: args.now_ms,
    });

    const outstandingUnits = await getOutstandingUsageUnitsForQuotaPeriod(ctx, {
        quota_period_id: quotaPeriod._id,
        operation: args.operation,
    });
    const reservationSnapshot = resolveQuotaCounterReservationSnapshot({
        counter: quotaPeriodCounter,
        outstanding_units: outstandingUnits,
    });
    const usedChars = reservationSnapshot.used_chars;

    if (
        shouldBlockQuotaUsageForPeriod({
            used_chars: usedChars,
            period_limit: reservationSnapshot.period_limit,
        })
    ) {
        return {
            allowed: false as const,
            reason: "monthly_limit_exceeded" as const,
            plan_key: quotaContext.planKey,
            input_limit: reservationSnapshot.input_limit,
            monthly_limit: reservationSnapshot.period_limit,
            used_chars: usedChars,
        };
    }

    return {
        allowed: true as const,
        plan_key: quotaContext.planKey,
        input_limit: reservationSnapshot.input_limit,
        monthly_limit: reservationSnapshot.period_limit,
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
        const activeDeletionOperation = await getLatestUserDeletionQueueEntryByUserId(ctx, args.user_id);

        if (doesUserDeletionStatusBlockProcessing(activeDeletionOperation?.status)) {
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
            const applyResult = await applyUsageEventChargeToResolvedQuotaPeriod(ctx, {
                usageEvent,
                charged_units: chargedUnits,
                now_ms: args.now_ms,
            });

            if (applyResult.status !== "applied") {
                return applyResult;
            }

            await ctx.db.patch(
                usageEvent._id,
                buildUsageEventQuotaAppliedPatch({
                    state: usageEvent.state,
                    charged_units: chargedUnits,
                    charged_at_ms: usageEvent.charged_at_ms,
                    now_ms: args.now_ms,
                })
            );

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
        const applyResult = await applyUsageEventChargeToResolvedQuotaPeriod(ctx, {
            usageEvent,
            charged_units: chargedUnits,
            now_ms: args.now_ms,
        });

        if (applyResult.status !== "applied") {
            return applyResult;
        }

        await ctx.db.patch(
            usageEvent._id,
            buildUsageEventQuotaAppliedPatch({
                state: usageEvent.state,
                charged_units: chargedUnits,
                now_ms: args.now_ms,
            })
        );

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
                !canTransitionUsageEventToAfterChargeTerminalState({
                    state: usageEvent.state,
                    is_charged: isUsageEventCharged(usageEvent),
                })
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
                !canTransitionUsageEventToAfterChargeTerminalState({
                    state: usageEvent.state,
                    is_charged: isUsageEventCharged(usageEvent),
                })
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

        const applyResult = await applyPendingUsageEventChargeToQuotaPeriod(ctx, {
            usageEvent,
            now_ms: args.now_ms,
        });

        if (applyResult.status === "not_charged") {
            return {
                status: "skipped",
                state: usageEvent.state,
            };
        }

        if (applyResult.status !== "applied") {
            return applyResult;
        }

        return {
            status: "applied",
            charged_units: applyResult.charged_units,
            state: applyResult.state,
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

        const insertionTimeMs = args.received_at_ms;
        const targetUserIds = resolveTargetUserIdsFromRevenueCatEvent(args.normalized_event);
        const resolvedUserId = targetUserIds[0] ?? undefined;

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

        for (const userId of targetUserIds) {
            await ctx.db.insert("revenue_cat_event_users", {
                event_doc_id: eventDocId,
                user_id: userId,
                status: "pending",
                created_at_ms: insertionTimeMs,
                updated_at_ms: insertionTimeMs,
            });
        }

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

        const eventUsers = await listRevenueCatEventUsersByEventDocId(ctx, eventDoc._id);
        const userSummary = summarizeRevenueCatEventUserState(eventDoc, eventUsers);

        return {
            event_id: eventDoc.event_id,
            event_type: eventDoc.event_type,
            status: eventDoc.status,
            user_id: eventDoc.user_id,
            transaction_id: eventDoc.transaction_id,
            target_user_ids: userSummary.target_user_ids,
            pending_user_ids: userSummary.pending_user_ids,
            processed_user_ids: userSummary.processed_user_ids,
            ignored_user_ids: userSummary.ignored_user_ids,
        };
    },
});

export const acquireRevenueCatEventProcessingLeases = mutation({
    args: {
        event_doc_id: v.id("revenue_cat_events"),
        user_ids: v.array(v.string()),
        now_ms: v.number(),
        lease_expires_at_ms: v.number(),
    },
    handler: async (ctx, args) => {
        const eventDoc = await ctx.db.get(args.event_doc_id);

        if (!eventDoc || PROCESSED_EVENT_STATUSES.has(eventDoc.status)) {
            return {
                status: eventDoc?.status ?? "missing",
                acquired_user_ids: [],
                active_processing_user_ids: [],
                blocked_user_ids: [],
            };
        }

        const requestedUserIds = normalizeRevenueCatEventUserIds(args.user_ids);
        const allEventUsers = await listRevenueCatEventUsersByEventDocId(ctx, eventDoc._id);
        const eventUsersByUserId = new Map(allEventUsers.map((eventUser) => [eventUser.user_id, eventUser]));
        const acquiredUserIds: string[] = [];
        const activeProcessingUserIds: string[] = [];
        const blockedUserIds: string[] = [];

        for (const userId of requestedUserIds) {
            const eventUser = eventUsersByUserId.get(userId);

            if (!eventUser || eventUser.status !== "pending") {
                continue;
            }

            const eventUserProcessingExpiresAtMs = (eventUser as Record<string, unknown>)
                .processing_expires_at_ms;

            if (
                typeof eventUserProcessingExpiresAtMs === "number" &&
                eventUserProcessingExpiresAtMs > args.now_ms
            ) {
                activeProcessingUserIds.push(userId);
                continue;
            }

            const activeDeletionOperation = await getLatestUserDeletionQueueEntryByUserId(ctx, userId);

            if (doesUserDeletionStatusBlockRevenueCatReconciliation(activeDeletionOperation?.status)) {
                blockedUserIds.push(userId);
                continue;
            }

            await ctx.db.patch(eventUser._id, {
                processing_started_at_ms: args.now_ms,
                processing_expires_at_ms: args.lease_expires_at_ms,
                updated_at_ms: args.now_ms,
            } as Record<string, unknown>);

            acquiredUserIds.push(userId);
        }

        return {
            status: eventDoc.status,
            acquired_user_ids: acquiredUserIds,
            active_processing_user_ids: activeProcessingUserIds,
            blocked_user_ids: blockedUserIds,
        };
    },
});

export const getActiveRevenueCatEventProcessingForUserDeletion = query({
    args: {
        user_id: v.string(),
        now_ms: v.number(),
        limit: v.number(),
    },
    handler: async (ctx, args) => {
        const safeLimit = Math.max(1, args.limit);
        const activeProcessingEventUsers = await ctx.db
            .query("revenue_cat_event_users")
            .withIndex("by_user_id_status_and_processing_expires_at_ms", (query) =>
                query
                    .eq("user_id", args.user_id)
                    .eq("status", "pending")
                    .gt("processing_expires_at_ms", args.now_ms)
            )
            .take(safeLimit);

        return {
            active_processing_count: activeProcessingEventUsers.length,
            has_more: activeProcessingEventUsers.length >= safeLimit,
            processing_expires_at_ms: activeProcessingEventUsers[0]?.processing_expires_at_ms,
        };
    },
});

export const recordRevenueCatEventProcessingProgress = mutation({
    args: {
        event_doc_id: v.id("revenue_cat_events"),
        now_ms: v.number(),
        processed_user_ids: v.array(v.string()),
        ignored_user_ids: v.array(v.string()),
        released_user_ids: v.optional(v.array(v.string())),
        status_message: v.optional(v.string()),
        next_retry_at_ms: v.optional(v.number()),
        error_message: v.optional(v.string()),
        retry_config: v.optional(retryConfigValidator),
    },
    handler: async (ctx, args) => {
        const eventDoc = await ctx.db.get(args.event_doc_id);

        if (!eventDoc || PROCESSED_EVENT_STATUSES.has(eventDoc.status)) {
            return {
                status: eventDoc?.status ?? "missing",
            };
        }

        const processedUserIds = normalizeRevenueCatEventUserIds(args.processed_user_ids);
        const ignoredUserIds = normalizeRevenueCatEventUserIds(
            args.ignored_user_ids.filter((userId) => !processedUserIds.includes(userId))
        );
        const releasedUserIds = normalizeRevenueCatEventUserIds(
            (args.released_user_ids ?? []).filter(
                (userId) => !processedUserIds.includes(userId) && !ignoredUserIds.includes(userId)
            )
        );
        const allEventUsers = await listRevenueCatEventUsersByEventDocId(ctx, eventDoc._id);
        const eventUsersByUserId = new Map(allEventUsers.map((eventUser) => [eventUser.user_id, eventUser]));

        for (const userId of processedUserIds) {
            const eventUser = eventUsersByUserId.get(userId);

            if (!eventUser || eventUser.status === "processed") {
                continue;
            }

            await ctx.db.patch(eventUser._id, {
                status: "processed",
                processing_started_at_ms: undefined,
                processing_expires_at_ms: undefined,
                updated_at_ms: args.now_ms,
            } as Record<string, unknown>);
        }

        for (const userId of ignoredUserIds) {
            const eventUser = eventUsersByUserId.get(userId);

            if (!eventUser || eventUser.status === "ignored") {
                continue;
            }

            await ctx.db.patch(eventUser._id, {
                status: "ignored",
                processing_started_at_ms: undefined,
                processing_expires_at_ms: undefined,
                updated_at_ms: args.now_ms,
            } as Record<string, unknown>);
        }

        for (const userId of releasedUserIds) {
            const eventUser = eventUsersByUserId.get(userId);

            if (!eventUser || eventUser.status !== "pending") {
                continue;
            }

            await ctx.db.patch(eventUser._id, {
                processing_started_at_ms: undefined,
                processing_expires_at_ms: undefined,
                updated_at_ms: args.now_ms,
            } as Record<string, unknown>);
        }

        const nextEventUsers = await listRevenueCatEventUsersByEventDocId(ctx, eventDoc._id);
        const userSummary = summarizeRevenueCatEventUserState(eventDoc, nextEventUsers);
        const patch: MutableRevenueCatEventFields = {
            updated_at_ms: args.now_ms,
            user_id: userSummary.target_user_ids.includes(eventDoc.user_id ?? "")
                ? eventDoc.user_id
                : userSummary.target_user_ids[0],
        };

        if (typeof args.error_message === "string") {
            if (!args.retry_config) {
                throw new Error("Missing retry config for RevenueCat event failure");
            }

            if (userSummary.pending_user_ids.length === 0) {
                patch.status = userSummary.processed_user_ids.length > 0 ? "processed" : "ignored";
                patch.retry_count = 0;
                patch.next_retry_at_ms = args.now_ms;
                patch.processed_at_ms = args.now_ms;
                patch.last_error =
                    patch.status === "ignored"
                        ? (args.status_message ?? args.error_message).slice(0, 400)
                        : undefined;
            } else {
                const nextRetryCount = eventDoc.retry_count + 1;
                const maxRetryCount = Math.max(1, args.retry_config.max_retry_count);
                const hasReachedMaxRetries = nextRetryCount >= maxRetryCount;

                patch.status = hasReachedMaxRetries ? "dead_letter" : "failed";
                patch.retry_count = nextRetryCount;
                patch.next_retry_at_ms = hasReachedMaxRetries
                    ? args.now_ms
                    : getNextRetryAtMs(args.now_ms, nextRetryCount, args.retry_config);
                patch.processed_at_ms = undefined;
                patch.last_error = args.error_message.slice(0, 400);
            }
        } else if (userSummary.pending_user_ids.length > 0) {
            patch.status = "pending";
            patch.next_retry_at_ms = args.next_retry_at_ms ?? args.now_ms;
            patch.processed_at_ms = undefined;
            patch.last_error = args.status_message?.slice(0, 400);
        } else {
            patch.status = userSummary.processed_user_ids.length > 0 ? "processed" : "ignored";
            patch.retry_count = 0;
            patch.next_retry_at_ms = args.now_ms;
            patch.processed_at_ms = args.now_ms;
            patch.last_error =
                patch.status === "ignored" ? args.status_message?.slice(0, 400) : undefined;
        }

        await ctx.db.patch(eventDoc._id, patch);

        return {
            status: patch.status,
            pending_user_ids: userSummary.pending_user_ids,
            processed_user_ids: userSummary.processed_user_ids,
            ignored_user_ids: userSummary.ignored_user_ids,
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

            if (eventDoc && !PROCESSED_EVENT_STATUSES.has(eventDoc.status)) {
                continue;
            }

            await deleteRevenueCatEventUsersByEventDocId(ctx, eventDocId);

            if (eventDoc) {
                await ctx.db.delete(eventDocId);
                deletedCount += 1;
            }
        }

        return {
            deleted_count: deletedCount,
        };
    },
});

export const deleteFrozenQuotaPeriodsEligibleForRetentionPurge = mutation({
    args: {
        older_than_ms: v.number(),
        limit: v.number(),
    },
    handler: async (ctx, args) => {
        const safeLimit = Math.max(1, Math.min(args.limit, 500));
        const quotaPeriods = await ctx.db
            .query("quota_periods")
            .withIndex("by_status_and_period_end_at_ms", (query) =>
                query.eq("status", "frozen").lte("period_end_at_ms", args.older_than_ms)
            )
            .take(safeLimit);
        let deletedCount = 0;
        let retainedLinkedCount = 0;

        for (const quotaPeriod of quotaPeriods) {
            if (quotaPeriod.user_id !== null) {
                retainedLinkedCount += 1;
                continue;
            }

            await deleteQuotaPeriodCountersByQuotaPeriodId(ctx, quotaPeriod._id);
            await ctx.db.delete(quotaPeriod._id);
            deletedCount += 1;
        }

        return {
            scanned_count: quotaPeriods.length,
            deleted_count: deletedCount,
            retained_linked_count: retainedLinkedCount,
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

        return {
            user_id: state.user_id,
            revenuecat_app_user_id: state.revenuecat_app_user_id,
            plan_key: state.plan_key,
            has_active_subscription: state.has_active_subscription,
            store_subscription_id: state.store_subscription_id,
            store_subscription_period_id: state.store_subscription_period_id,
            billing_cycle_end_at_ms: state.billing_cycle_end_at_ms,
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
        return getUserDeletionSnapshotRecordByUserId(ctx, args.user_id);
    },
});

export const ensureUserDeletionPreservedQuotaPeriod = mutation({
    args: {
        user_id: v.string(),
        now_ms: v.number(),
    },
    handler: async (ctx, args) => {
        const state = await getLatestSubscriptionStateByUserId(ctx, args.user_id);

        if (!state || !state.has_active_subscription) {
            return getUserDeletionSnapshotRecordByUserId(ctx, args.user_id);
        }

        const quotaPeriods = await listQuotaPeriodsByUserId(ctx, args.user_id);
        const currentQuotaPeriod = await getMostRelevantQuotaPeriodForWindow(
            ctx,
            quotaPeriods,
            getSubscriptionWindowFromQuotaPeriodSyncSource(
                buildQuotaPeriodSyncSourceFromSubscriptionState(state)
            )
        );

        if (currentQuotaPeriod) {
            return {
                has_active_subscription: state.has_active_subscription,
                revenuecat_app_user_id: state.revenuecat_app_user_id,
                current_quota_period_id: currentQuotaPeriod._id,
                store_subscription_id: state.store_subscription_id,
                store_subscription_period_id: state.store_subscription_period_id,
            };
        }

        const planLimits = await resolvePlanLimitsForPlanKey(ctx, {
            plan_key: state.plan_key,
            now_ms: args.now_ms,
        });
        const repairedQuotaPeriod = await upsertOpenQuotaPeriodDoc(ctx, {
            user_id: args.user_id,
            source: buildQuotaPeriodSyncSourceFromSubscriptionState(state),
            planLimits,
            now_ms: args.now_ms,
        });

        return {
            has_active_subscription: state.has_active_subscription,
            revenuecat_app_user_id: state.revenuecat_app_user_id,
            current_quota_period_id: repairedQuotaPeriod._id,
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
        const operation = await getLatestUserDeletionQueueEntryByUserId(ctx, args.user_id);

        return {
            in_progress: operation !== null,
            blocks_processing: doesUserDeletionStatusBlockProcessing(operation?.status),
            blocks_revenuecat_reconciliation:
                doesUserDeletionStatusBlockRevenueCatReconciliation(operation?.status),
            status: operation?.status,
            started_at_ms: operation?.started_at_ms,
            prepared_at_ms: operation?.prepared_at_ms,
            auth_deleted_at_ms: operation?.auth_deleted_at_ms,
            next_retry_at_ms: operation?.next_retry_at_ms,
            retry_count: operation?.retry_count,
            force_stop_after_at_ms: operation?.force_stop_after_at_ms,
            updated_at_ms: operation?.updated_at_ms,
            revenuecat_app_user_id: operation?.revenuecat_app_user_id,
            has_active_subscription: operation?.has_active_subscription,
            preserved_quota_period_id: operation?.preserved_quota_period_id,
            store_subscription_id: operation?.store_subscription_id,
            store_subscription_period_id: operation?.store_subscription_period_id,
        };
    },
});

export const listDueUserDeletionOperations = query({
    args: {
        now_ms: v.number(),
        limit: v.number(),
    },
    handler: async (ctx, args) => {
        const safeLimit = Math.max(1, Math.min(args.limit, 50));
        const candidateEntries = await ctx.db
            .query("user_deletion_queue")
            .withIndex("by_next_retry_at_ms", (query) => query.lte("next_retry_at_ms", args.now_ms))
            .take(safeLimit * 5);
        const entriesByUserId = new Map<string, Doc<"user_deletion_queue">>();

        for (const entry of candidateEntries) {
            const existingEntry = entriesByUserId.get(entry.user_id) ?? null;

            if (
                !existingEntry ||
                entry.updated_at_ms > existingEntry.updated_at_ms ||
                (entry.updated_at_ms === existingEntry.updated_at_ms &&
                    entry._creationTime > existingEntry._creationTime)
            ) {
                entriesByUserId.set(entry.user_id, entry);
            }
        }

        return [...entriesByUserId.values()]
            .filter((entry) => doesUserDeletionStatusAllowAutomaticRetry(entry.status))
            .sort((left, right) => {
                if (left.next_retry_at_ms !== right.next_retry_at_ms) {
                    return left.next_retry_at_ms - right.next_retry_at_ms;
                }

                return left.updated_at_ms - right.updated_at_ms;
            })
            .slice(0, safeLimit)
            .map((entry) => ({
                user_id: entry.user_id,
                status: entry.status,
                next_retry_at_ms: entry.next_retry_at_ms,
            }));
    },
});

export const listAuthDeleteDeadLetterUserDeletionOperations = query({
    args: {
        limit: v.number(),
    },
    handler: async (ctx, args) => {
        const safeLimit = Math.max(1, Math.min(args.limit, 50));
        const entries = await ctx.db
            .query("user_deletion_queue")
            .withIndex("by_status_and_updated_at_ms", (query) =>
                query.eq("status", USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS)
            )
            .order("asc")
            .take(safeLimit * 3);
        const entriesByUserId = new Map<string, Doc<"user_deletion_queue">>();

        for (const entry of entries) {
            const existingEntry = entriesByUserId.get(entry.user_id) ?? null;

            if (
                !existingEntry ||
                entry.updated_at_ms > existingEntry.updated_at_ms ||
                (entry.updated_at_ms === existingEntry.updated_at_ms &&
                    entry._creationTime > existingEntry._creationTime)
            ) {
                entriesByUserId.set(entry.user_id, entry);
            }
        }

        return [...entriesByUserId.values()]
            .sort((left, right) => left.updated_at_ms - right.updated_at_ms)
            .slice(0, safeLimit)
            .map((entry) => ({
                user_id: entry.user_id,
                status: entry.status,
                updated_at_ms: entry.updated_at_ms,
            }));
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
            const activeDeletionOperation = await getLatestUserDeletionQueueEntryByUserId(ctx, args.user_id);

            if (doesUserDeletionStatusBlockProcessing(activeDeletionOperation?.status)) {
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
                      store_subscription_id: nextStoreSubscriptionId,
                      store: args.snapshot.store ?? existingState?.store,
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
            initial_counter_source_quota_period_id: restorableFrozenQuotaPeriod?._id,
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

export const startUserDeletionOperation = mutation({
    args: {
        user_id: v.string(),
        now_ms: v.number(),
    },
    handler: async (ctx, args) => {
        const nextOperation = buildUserDeletionQueueEntry({
            user_id: args.user_id,
            status: "preparing",
            started_at_ms: args.now_ms,
            next_retry_at_ms: args.now_ms,
            retry_count: 0,
            updated_at_ms: args.now_ms,
        });

        await replaceUserDeletionQueueEntry(ctx, args.user_id, nextOperation);

        return {
            in_progress: true,
            started_at_ms: nextOperation.started_at_ms,
            status: nextOperation.status,
            updated_at_ms: nextOperation.updated_at_ms,
        };
    },
});

export const clearUserDeletionOperation = mutation({
    args: {
        user_id: v.string(),
    },
    handler: async (ctx, args) => {
        const operations = await listUserDeletionQueueEntriesByUserId(ctx, args.user_id);

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
        const latestOperation = await getLatestUserDeletionQueueEntryByUserId(ctx, args.user_id);
        const nextPreparation = buildUserDeletionQueueEntry({
            user_id: args.user_id,
            status: latestOperation?.auth_deleted_at_ms ? "ready_for_cleanup" : "awaiting_auth_delete",
            started_at_ms: latestOperation?.started_at_ms ?? args.prepared_at_ms,
            prepared_at_ms: args.prepared_at_ms,
            auth_deleted_at_ms: latestOperation?.auth_deleted_at_ms,
            next_retry_at_ms: latestOperation?.next_retry_at_ms ?? args.prepared_at_ms,
            retry_count: latestOperation?.retry_count ?? 0,
            force_stop_after_at_ms: latestOperation?.force_stop_after_at_ms,
            revenuecat_app_user_id:
                args.revenuecat_app_user_id ?? latestOperation?.revenuecat_app_user_id,
            has_active_subscription: args.has_active_subscription,
            preserved_quota_period_id: args.preserved_quota_period_id,
            store_subscription_id: args.store_subscription_id,
            store_subscription_period_id: args.store_subscription_period_id,
            updated_at_ms: args.prepared_at_ms,
        });

        await replaceUserDeletionQueueEntry(ctx, args.user_id, nextPreparation);

        return {
            has_active_subscription: nextPreparation.has_active_subscription,
            revenuecat_app_user_id: nextPreparation.revenuecat_app_user_id,
            preserved_quota_period_id: nextPreparation.preserved_quota_period_id,
            store_subscription_id: nextPreparation.store_subscription_id,
            store_subscription_period_id: nextPreparation.store_subscription_period_id,
        };
    },
});

export const markUserDeletionAuthDeleted = mutation({
    args: {
        user_id: v.string(),
        now_ms: v.number(),
        force_stop_after_at_ms: v.number(),
    },
    handler: async (ctx, args) => {
        const latestOperation = await getLatestUserDeletionQueueEntryByUserId(ctx, args.user_id);
        const deletionSnapshot = await getUserDeletionSnapshotRecordByUserId(ctx, args.user_id);
        const nextContext = resolveAuthDeletedUserDeletionContext({
            snapshot: deletionSnapshot,
            existing_context: latestOperation
                ? {
                      has_active_subscription: latestOperation.has_active_subscription,
                      revenuecat_app_user_id: latestOperation.revenuecat_app_user_id,
                      preserved_quota_period_id: latestOperation.preserved_quota_period_id,
                      store_subscription_id: latestOperation.store_subscription_id,
                      store_subscription_period_id: latestOperation.store_subscription_period_id,
                  }
                : undefined,
        });

        if (!latestOperation) {
            const nextOperation = buildUserDeletionQueueEntry({
                user_id: args.user_id,
                status: "ready_for_cleanup",
                started_at_ms: args.now_ms,
                prepared_at_ms: args.now_ms,
                auth_deleted_at_ms: args.now_ms,
                next_retry_at_ms: args.now_ms,
                retry_count: 0,
                force_stop_after_at_ms: args.force_stop_after_at_ms,
                revenuecat_app_user_id: nextContext.revenuecat_app_user_id,
                has_active_subscription: nextContext.has_active_subscription,
                ...(nextContext.preserved_quota_period_id
                    ? { preserved_quota_period_id: nextContext.preserved_quota_period_id }
                    : {}),
                ...(nextContext.store_subscription_id
                    ? { store_subscription_id: nextContext.store_subscription_id }
                    : {}),
                ...(nextContext.store_subscription_period_id
                    ? {
                          store_subscription_period_id: nextContext.store_subscription_period_id,
                      }
                    : {}),
                updated_at_ms: args.now_ms,
            });

            await replaceUserDeletionQueueEntry(ctx, args.user_id, nextOperation);

            return {
                updated: true,
                recreated: true,
                auth_deleted_at_ms: nextOperation.auth_deleted_at_ms,
                next_retry_at_ms: nextOperation.next_retry_at_ms,
                status: nextOperation.status,
            };
        }

        const shouldRefreshContext = typeof latestOperation.auth_deleted_at_ms !== "number";
        const nextOperation = buildUserDeletionQueueEntry({
            user_id: latestOperation.user_id,
            status: "ready_for_cleanup",
            started_at_ms: latestOperation.started_at_ms,
            prepared_at_ms: latestOperation.prepared_at_ms ?? args.now_ms,
            auth_deleted_at_ms: latestOperation.auth_deleted_at_ms ?? args.now_ms,
            next_retry_at_ms: args.now_ms,
            retry_count: latestOperation.retry_count,
            force_stop_after_at_ms:
                latestOperation.force_stop_after_at_ms ?? args.force_stop_after_at_ms,
            revenuecat_app_user_id: shouldRefreshContext
                ? nextContext.revenuecat_app_user_id
                : latestOperation.revenuecat_app_user_id,
            has_active_subscription: shouldRefreshContext
                ? nextContext.has_active_subscription
                : latestOperation.has_active_subscription,
            preserved_quota_period_id: shouldRefreshContext
                ? nextContext.preserved_quota_period_id
                : latestOperation.preserved_quota_period_id,
            store_subscription_id: shouldRefreshContext
                ? nextContext.store_subscription_id
                : latestOperation.store_subscription_id,
            store_subscription_period_id: shouldRefreshContext
                ? nextContext.store_subscription_period_id
                : latestOperation.store_subscription_period_id,
            updated_at_ms: args.now_ms,
        });

        await replaceUserDeletionQueueEntry(ctx, args.user_id, nextOperation);

        return {
            updated: true,
            recreated: false,
            auth_deleted_at_ms: nextOperation.auth_deleted_at_ms,
            next_retry_at_ms: nextOperation.next_retry_at_ms,
            status: nextOperation.status,
        };
    },
});

export const acquireUserDeletionOperation = mutation({
    args: {
        user_id: v.string(),
        now_ms: v.number(),
        lease_expires_at_ms: v.number(),
        allow_terminal_recovery: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const latestOperation = await getLatestUserDeletionQueueEntryByUserId(ctx, args.user_id);

        if (!latestOperation) {
            return {
                acquired: false,
                missing: true,
            };
        }

        if (!canAcquireUserDeletionOperation({
            status: latestOperation.status,
            next_retry_at_ms: latestOperation.next_retry_at_ms,
            now_ms: args.now_ms,
            allow_terminal_recovery: args.allow_terminal_recovery,
        })) {
            return {
                acquired: false,
                missing: false,
                status: latestOperation.status,
                next_retry_at_ms: latestOperation.next_retry_at_ms,
            };
        }

        const nextOperation = buildUserDeletionQueueEntry({
            user_id: latestOperation.user_id,
            status: "cleanup_in_progress",
            started_at_ms: latestOperation.started_at_ms,
            prepared_at_ms: latestOperation.prepared_at_ms,
            auth_deleted_at_ms: latestOperation.auth_deleted_at_ms,
            next_retry_at_ms: args.lease_expires_at_ms,
            retry_count: latestOperation.retry_count,
            force_stop_after_at_ms: latestOperation.force_stop_after_at_ms,
            revenuecat_app_user_id: latestOperation.revenuecat_app_user_id,
            has_active_subscription: latestOperation.has_active_subscription,
            preserved_quota_period_id: latestOperation.preserved_quota_period_id,
            store_subscription_id: latestOperation.store_subscription_id,
            store_subscription_period_id: latestOperation.store_subscription_period_id,
            updated_at_ms: args.now_ms,
        });

        await replaceUserDeletionQueueEntry(ctx, args.user_id, nextOperation);

        return {
            acquired: true,
            missing: false,
            operation: {
                user_id: nextOperation.user_id,
                status: nextOperation.status,
                started_at_ms: nextOperation.started_at_ms,
                prepared_at_ms: nextOperation.prepared_at_ms,
                auth_deleted_at_ms: nextOperation.auth_deleted_at_ms,
                next_retry_at_ms: nextOperation.next_retry_at_ms,
                retry_count: nextOperation.retry_count,
                force_stop_after_at_ms: nextOperation.force_stop_after_at_ms,
                revenuecat_app_user_id: nextOperation.revenuecat_app_user_id,
                has_active_subscription: nextOperation.has_active_subscription,
                preserved_quota_period_id: nextOperation.preserved_quota_period_id,
                store_subscription_id: nextOperation.store_subscription_id,
                store_subscription_period_id: nextOperation.store_subscription_period_id,
                updated_at_ms: nextOperation.updated_at_ms,
            },
        };
    },
});

export const rescheduleUserDeletionOperation = mutation({
    args: {
        user_id: v.string(),
        status: userDeletionQueueStatusValidator,
        now_ms: v.number(),
        next_retry_at_ms: v.number(),
        retry_count_increment: v.optional(v.number()),
        last_error: v.optional(v.union(v.string(), v.null())),
        auth_deleted_at_ms: v.optional(v.number()),
        force_stop_after_at_ms: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const latestOperation = await getLatestUserDeletionQueueEntryByUserId(ctx, args.user_id);

        if (!latestOperation) {
            return {
                updated: false,
            };
        }

        const nextOperation = buildUserDeletionQueueEntry({
            user_id: latestOperation.user_id,
            status: args.status,
            started_at_ms: latestOperation.started_at_ms,
            prepared_at_ms: latestOperation.prepared_at_ms,
            auth_deleted_at_ms: args.auth_deleted_at_ms ?? latestOperation.auth_deleted_at_ms,
            next_retry_at_ms: args.next_retry_at_ms,
            retry_count: latestOperation.retry_count + Math.max(0, args.retry_count_increment ?? 0),
            last_error:
                args.last_error === null
                    ? undefined
                    : (args.last_error ?? latestOperation.last_error),
            force_stop_after_at_ms:
                args.force_stop_after_at_ms ?? latestOperation.force_stop_after_at_ms,
            revenuecat_app_user_id: latestOperation.revenuecat_app_user_id,
            has_active_subscription: latestOperation.has_active_subscription,
            preserved_quota_period_id: latestOperation.preserved_quota_period_id,
            store_subscription_id: latestOperation.store_subscription_id,
            store_subscription_period_id: latestOperation.store_subscription_period_id,
            updated_at_ms: args.now_ms,
        });

        await replaceUserDeletionQueueEntry(ctx, args.user_id, nextOperation);

        return {
            updated: true,
            status: nextOperation.status,
            next_retry_at_ms: nextOperation.next_retry_at_ms,
            retry_count: nextOperation.retry_count,
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
        const preservedQuotaPeriod = args.preserved_quota_period_id
            ? await ctx.db.get(args.preserved_quota_period_id)
            : null;
        const preservedQuotaWindow = preservedQuotaPeriod
            ? getLogicalQuotaPeriodWindow(preservedQuotaPeriod)
            : null;

        let remainingDeletes = USER_DELETION_BATCH_LIMIT;
        const usageEventsToDelete = await listUsageEventsByUserIdBatch(
            ctx,
            args.user_id,
            remainingDeletes
        );

        for (const usageEvent of usageEventsToDelete) {
            const linkedQuotaPeriod = preservedQuotaWindow
                ? await ctx.db.get(usageEvent.quota_period_id)
                : null;

            if (
                shouldApplyUsageEventChargeBeforeDeletion({
                    matches_preserved_logical_window:
                        preservedQuotaWindow !== null &&
                        linkedQuotaPeriod !== null &&
                        isSameLogicalQuotaPeriodWindow(linkedQuotaPeriod, preservedQuotaWindow),
                    is_charged: isUsageEventCharged(usageEvent),
                    quota_applied_at_ms: usageEvent.quota_applied_at_ms,
                })
            ) {
                const applyResult = await applyPendingUsageEventChargeToQuotaPeriod(ctx, {
                    usageEvent,
                    now_ms: args.now_ms,
                    target_quota_period_id: preservedQuotaPeriod?._id,
                });

                if (applyResult.status !== "applied" && applyResult.status !== "already_applied") {
                    throw new Error(
                        `Cannot delete preserved usage event ${String(usageEvent._id)} before applying charged quota usage: ${applyResult.status}`
                    );
                }
            }

            await ctx.db.delete(usageEvent._id);
        }
        remainingDeletes -= usageEventsToDelete.length;

        let deletedRevenueCatEvents = 0;

        if (remainingDeletes > 0) {
            const revenueCatEventsToDelete = await listRevenueCatEventsForUserDeletionBatch(ctx, {
                user_id: args.user_id,
                revenuecat_app_user_id: args.revenuecat_app_user_id,
                limit: remainingDeletes,
            });

            for (const eventDoc of revenueCatEventsToDelete) {
                await deleteOrPruneRevenueCatEventForDeletedUser(ctx, {
                    event_doc: eventDoc,
                    user_id: args.user_id,
                    now_ms: args.now_ms,
                });
                deletedRevenueCatEvents += 1;
            }
        }
        remainingDeletes -= deletedRevenueCatEvents;

        let deletedQuotaPeriods = 0;

        if (remainingDeletes > 0) {
            const quotaPeriodCandidates = await listQuotaPeriodsByUserIdBatch(
                ctx,
                args.user_id,
                remainingDeletes + 1
            );
            const quotaPeriodsToDelete = quotaPeriodCandidates
                .filter((quotaPeriod) => quotaPeriod._id !== args.preserved_quota_period_id)
                .slice(0, remainingDeletes);

            for (const quotaPeriod of quotaPeriodsToDelete) {
                await deleteQuotaPeriodCountersByQuotaPeriodId(ctx, quotaPeriod._id);
                await ctx.db.delete(quotaPeriod._id);
                deletedQuotaPeriods += 1;
            }
        }

        return {
            preserved_quota_period_id: args.preserved_quota_period_id ?? null,
            deleted_quota_periods: deletedQuotaPeriods,
            deleted_usage_events: usageEventsToDelete.length,
            deleted_revenue_cat_events: deletedRevenueCatEvents,
            has_remaining:
                usageEventsToDelete.length + deletedRevenueCatEvents + deletedQuotaPeriods > 0,
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
        const [stateDocs, quotaPeriodCandidates, usageEvents, revenueCatEvents] = await Promise.all([
            listSubscriptionStatesByUserId(ctx, args.user_id),
            listQuotaPeriodsByUserIdBatch(ctx, args.user_id, 2),
            listUsageEventsByUserIdBatch(ctx, args.user_id, 1),
            listRevenueCatEventsForUserDeletionBatch(ctx, {
                user_id: args.user_id,
                revenuecat_app_user_id: args.revenuecat_app_user_id,
                limit: 1,
            }),
        ]);
        const remainingQuotaPeriod = quotaPeriodCandidates.find(
            (quotaPeriod) => quotaPeriod._id !== args.preserved_quota_period_id
        );

        if (usageEvents.length > 0) {
            throw new Error("Cannot finalize deletion while usage events remain");
        }

        if (revenueCatEvents.length > 0) {
            throw new Error("Cannot finalize deletion while RevenueCat events remain");
        }

        if (remainingQuotaPeriod) {
            throw new Error("Cannot finalize deletion while quota periods remain");
        }

        let frozenQuotaPeriodId: Doc<"quota_periods">["_id"] | null = null;

        if (args.has_active_subscription && args.preserved_quota_period_id) {
            const preservedQuotaPeriod = await ctx.db.get(args.preserved_quota_period_id);

            if (!preservedQuotaPeriod) {
                console.error(
                    JSON.stringify({
                        event: "user_deletion_preserved_quota_period_missing_at_finalize",
                        user_id: args.user_id,
                        preserved_quota_period_id: args.preserved_quota_period_id,
                    })
                );
            } else {
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
        } else if (args.has_active_subscription) {
            console.error(
                JSON.stringify({
                    event: "user_deletion_completed_without_preserved_quota_period",
                    user_id: args.user_id,
                })
            );
        }

        for (const stateDoc of stateDocs) {
            await ctx.db.delete(stateDoc._id);
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

    await assertFreeStateUsageIntegrity(ctx, {
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

        await assertFreeStateUsageIntegrity(ctx, {
            state: args.sourceState,
            quotaPeriods: args.sourceQuotaPeriods,
            usageEvents: args.sourceUsageEvents,
            free_period_anchor_at_ms: resolvedSourceFreePeriodAnchorAtMs,
            now_ms: args.now_ms,
        });
    }

    const sourceUsageEventsByQuotaPeriodId = buildUsageEventsByQuotaPeriodId(args.sourceUsageEvents);

    for (const sourceQuotaPeriod of args.sourceQuotaPeriods.filter(isFreeQuotaPeriodDoc)) {
        await assertQuotaPeriodAppliedUsageIntegrity(ctx, {
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
    const appliedUsageDeltasByCounterKey = new Map<string, AppliedUsageDelta>();

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
            appliedUsageDeltasByCounterKey,
            sourceUsageEvent,
            targetQuotaPeriod._id
        );
    }

    await applyAppliedUsageDeltasToQuotaPeriodCounters(ctx, {
        quotaPeriodsById: targetQuotaPeriodsById,
        appliedUsageDeltasByCounterKey,
        planLimits: freePlanLimits,
        now_ms: args.now_ms,
    });

    for (const sourceQuotaPeriod of args.sourceQuotaPeriods) {
        await deleteQuotaPeriodCountersByQuotaPeriodId(ctx, sourceQuotaPeriod._id);
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
            updated_at_ms: args.now_ms,
        };

        if (sourceQuotaPeriod.status === "open" && matchingTargetQuotaPeriod.status !== "open") {
            quotaPeriodPatch.status = "open";
            quotaPeriodPatch.closed_at_ms = undefined;
        }

        await ctx.db.patch(matchingTargetQuotaPeriod._id, quotaPeriodPatch);
        await mergeQuotaPeriodCountersIntoTarget(ctx, {
            source_quota_period_id: sourceQuotaPeriod._id,
            target_quota_period_id: matchingTargetQuotaPeriod._id,
            now_ms: args.now_ms,
        });

        targetQuotaPeriodsByIdentity.set(sourceIdentity, {
            ...matchingTargetQuotaPeriod,
            ...quotaPeriodPatch,
        });
        await deleteQuotaPeriodCountersByQuotaPeriodId(ctx, sourceQuotaPeriod._id);
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
