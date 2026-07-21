import { internal } from "../_generated/api";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type * as WebhookArgs from "../validators/webhook";
import type { Doc } from "../_generated/dataModel";
import {
    getBillingCycleWindow,
    getRequiredAnchoredMonthlyWindow,
    getRequiredBillingCycleWindow,
    isSameLogicalQuotaPeriodWindow,
    isSameLogicalSubscriptionWindow,
    type SubscriptionWindow,
} from "./subscriptionWindows";
import { shouldBlockQuotaUsageForPeriod } from "./quotaAvailability";
import {
    canCompleteUsageEvent,
    finalizeStaleUsageEvent,
    resolveUsageEventFailureTransition,
} from "./usageEventLifecycle";
import {
    INPUT_CHARACTERS_QUOTA_UNIT,
    applyQuotaPeriodCounterCharge,
    copyQuotaPeriodCountersToQuotaPeriod,
    deleteQuotaPeriodCountersByQuotaPeriodId,
    getOrCreateQuotaPeriodCounter,
    mergeQuotaPeriodCountersIntoTarget,
    resolveQuotaCounterReservationSnapshot,
    resolveQuotaPeriodCounterLimits,
    resolveQuotaPeriodCounterUsageSummary,
    shouldRejectQuotaInputBeforeCounterCreation,
    syncExistingQuotaPeriodCountersForPlanLimits,
} from "./quotaPeriodCounters";
import {
    assertRequiredPreservedQuotaPeriod,
    canAcquireUserDeletionOperation,
    doesUserDeletionSubscriptionCleanupHaveRemaining,
    doesUserDeletionCleanupAttemptOwnOperation,
    doesUserDeletionStatusAllowAutomaticRetry,
    doesUserDeletionStatusBlockProcessing,
    doesUserDeletionStatusBlockRevenueCatReconciliation,
    getUserDeletionCleanupLeaseRetryAtMs,
    resolveAuthDeletedUserDeletionContext,
    type UserDeletionCleanupStep,
    type UserDeletionQueueStatus,
    USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS,
    USER_DELETION_CLEANUP_DEAD_LETTER_STATUS,
    USER_DELETION_LATE_AUTH_WAIT_STATUS,
} from "../../model/subscriptions/userDeletionQueue";
import {
    normalizeRevenueCatWebhookUserIds as normalizeRevenueCatEventUserIds,
    resolveRevenueCatWebhookTargetUserIds as resolveTargetUserIdsFromRevenueCatEvent,
} from "../../model/subscriptions/revenueCatWebhookIngestion";
import {
    deleteRevenueCatEventUsersByEventDocId,
    listRevenueCatEventUsersByEventDocId,
    summarizeRevenueCatEventUserState,
} from "./revenueCatEventUserDocuments";
import {
    deleteUsageEventsByUserIdBatch,
    getLatestSubscriptionStateByUserId,
    listActiveUsageEventsByUserIdBatch,
    listQuotaPeriodsByUserIdAndWindowKey,
    listQuotaPeriodsByUserId,
    listQuotaPeriodsByUserIdBatch,
    prepareQuotaPeriodsForUserDeletionBatch,
    listSubscriptionStatesByUserId,
    listUsageEventsByUserIdBatch,
    type DbReaderCtx,
} from "./documents";
import {
    resolveOperationLimits,
    resolvePlanLimitsForPlanKey,
    type SubscriptionPlanKey,
    type SubscriptionPlanLimits,
    type SubscriptionUsageOperation,
} from "./planLimits";
import {
    buildUserDeletionQueueEntry,
    getLatestUserDeletionQueueEntry,
    getLatestUserDeletionQueueEntryByUserId,
    listUserDeletionQueueEntriesByUserId,
    replaceUserDeletionQueueEntry,
    type UserDeletionQueueEntryDoc,
} from "./userDeletionQueueDocuments";
import {
    deleteOrPruneRevenueCatEventForDeletedUser,
    listRevenueCatEventsForUserDeletionBatch,
} from "./userDeletionRevenueCatEvents";
import { shouldIgnoreStaleReconciledSubscriptionState } from "../../model/subscriptions/revenueCatApi";
import { getExclusiveLeaseOwnershipFailure } from "./leaseOwnership";
import { MAX_PERSISTED_ERROR_MESSAGE_CHARS } from "../../constants/limits";
import { FAR_FUTURE_TIMESTAMP_MS } from "../../constants/time";
import {
    SUBSCRIPTION_PLAN_KEYS,
} from "../../constants/subscriptions";
import { REVENUECAT_TERMINAL_WEBHOOK_EVENT_STATUS_SET } from "../../constants/revenueCat";

const PROCESSED_EVENT_STATUSES = REVENUECAT_TERMINAL_WEBHOOK_EVENT_STATUS_SET;
const SUBSCRIPTION_SYNC_LEASE_MAX_MS = 30_000;
const PENDING_ACTIVE_SIGNAL_MAX_TTL_MS = 5 * 60 * 1000;

const NEVER_RECONCILE_AT_MS = FAR_FUTURE_TIMESTAMP_MS;
const QUOTA_USAGE_RESERVATION_WATCHDOG_DELAY_MS = 5 * 60 * 1000;
const USER_DELETION_BATCH_LIMIT = 500;

type RetryConfig = {
    max_retry_count: number;
    retry_base_delay_ms: number;
    retry_max_delay_ms: number;
};
type RefreshRateLimitKind = "refresh_normal" | "refresh_purchase" | "refresh_daily";
type RefreshRateLimitBucketPlan = {
    kind: RefreshRateLimitKind;
    window_ms: number;
    max_count: number;
};
type RefreshRateLimitBucketState = RefreshRateLimitBucketPlan & {
    window_start_ms: number;
    window_end_ms: number;
    count: number;
    retained_entry: Doc<"refresh_rate_limits"> | null;
    duplicate_entries: Doc<"refresh_rate_limits">[];
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

const AUTOMATIC_USER_DELETION_RETRY_STATUSES: UserDeletionQueueStatus[] = [
    "preparing",
    "awaiting_auth_delete",
    USER_DELETION_LATE_AUTH_WAIT_STATUS,
    "ready_for_cleanup",
    "waiting_for_quiescence",
    "retryable_error",
    "cleanup_in_progress",
];

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

function getFixedWindowStartMs(nowMs: number, windowMs: number) {
    return Math.floor(nowMs / windowMs) * windowMs;
}

function getLatestRefreshRateLimitEntry(entries: Doc<"refresh_rate_limits">[]) {
    return [...entries].sort((left, right) => {
        if (right.updated_at_ms !== left.updated_at_ms) {
            return right.updated_at_ms - left.updated_at_ms;
        }

        return right._creationTime - left._creationTime;
    })[0] ?? null;
}

async function getRefreshRateLimitBucketState(
    ctx: Pick<MutationCtx, "db">,
    userId: string,
    plan: RefreshRateLimitBucketPlan,
    nowMs: number
): Promise<RefreshRateLimitBucketState> {
    const safeWindowMs = Math.max(1, Math.floor(plan.window_ms));
    const windowStartMs = getFixedWindowStartMs(nowMs, safeWindowMs);
    const windowEndMs = windowStartMs + safeWindowMs;
    const entries = await ctx.db
        .query("refresh_rate_limits")
        .withIndex("by_user_id_kind_and_window_start_ms", (query) =>
            query
                .eq("user_id", userId)
                .eq("kind", plan.kind)
                .eq("window_start_ms", windowStartMs)
        )
        .collect();
    const currentWindowEntries = entries.filter(
        (entry) =>
            entry.window_start_ms === windowStartMs && entry.window_end_ms === windowEndMs
    );
    const retainedEntry = getLatestRefreshRateLimitEntry(currentWindowEntries);

    return {
        ...plan,
        window_ms: safeWindowMs,
        max_count: Math.max(1, Math.floor(plan.max_count)),
        window_start_ms: windowStartMs,
        window_end_ms: windowEndMs,
        count: currentWindowEntries.reduce((total, entry) => total + Math.max(0, entry.count), 0),
        retained_entry: retainedEntry,
        duplicate_entries: entries.filter((entry) => entry._id !== retainedEntry?._id),
    };
}

async function persistRefreshRateLimitBucketState(
    ctx: Pick<MutationCtx, "db">,
    userId: string,
    state: RefreshRateLimitBucketState,
    nextCount: number,
    nowMs: number
) {
    if (state.retained_entry) {
        await ctx.db.patch("refresh_rate_limits", state.retained_entry._id, {
            window_start_ms: state.window_start_ms,
            window_end_ms: state.window_end_ms,
            count: nextCount,
            updated_at_ms: nowMs,
        });
    } else {
        await ctx.db.insert("refresh_rate_limits", {
            user_id: userId,
            kind: state.kind,
            window_start_ms: state.window_start_ms,
            window_end_ms: state.window_end_ms,
            count: nextCount,
            updated_at_ms: nowMs,
        });
    }

    for (const duplicateEntry of state.duplicate_entries) {
        await ctx.db.delete("refresh_rate_limits", duplicateEntry._id);
    }
}

function assertPreservedQuotaPeriodBelongsToDeletionUser(args: {
    user_id: string;
    has_active_subscription: boolean;
    preserved_quota_period_id?: Doc<"quota_periods">["_id"] | null;
    preservedQuotaPeriod: Doc<"quota_periods"> | null;
}) {
    assertRequiredPreservedQuotaPeriod({
        user_id: args.user_id,
        has_active_subscription: args.has_active_subscription,
        preserved_quota_period_id: args.preserved_quota_period_id,
    });

    if (!args.has_active_subscription) {
        return;
    }

    if (!args.preservedQuotaPeriod) {
        throw new Error("Cannot continue paid-user deletion because the preserved quota period is missing");
    }

    if (
        args.preservedQuotaPeriod.user_id !== args.user_id &&
        args.preservedQuotaPeriod.user_id !== null
    ) {
        throw new Error("Cannot continue paid-user deletion with a quota period owned by another user");
    }
}

function getUserDeletionCleanupOwnershipFailure(args: {
    operation: UserDeletionQueueEntryDoc | null;
    cleanup_attempt_id?: string;
    now_ms?: number;
}) {
    if (typeof args.cleanup_attempt_id !== "string") {
        return null;
    }

    if (!args.operation) {
        return "missing" as const;
    }

    if (args.operation.status !== "cleanup_in_progress") {
        return "not_in_progress" as const;
    }

    if (
        !doesUserDeletionCleanupAttemptOwnOperation({
            current_cleanup_attempt_id: args.operation.cleanup_attempt_id,
            cleanup_attempt_id: args.cleanup_attempt_id,
        })
    ) {
        return "owner_mismatch" as const;
    }

    if (
        typeof args.now_ms === "number" &&
        typeof args.operation.cleanup_lease_expires_at_ms === "number" &&
        args.operation.cleanup_lease_expires_at_ms <= args.now_ms
    ) {
        return "lease_expired" as const;
    }

    return null;
}

function getRevenueCatEventProcessingOwnershipFailure(args: {
    event_user: Record<string, unknown>;
    processing_attempt_id?: string;
    now_ms: number;
}) {
    return getExclusiveLeaseOwnershipFailure({
        current_attempt_id:
            typeof args.event_user.processing_attempt_id === "string"
                ? args.event_user.processing_attempt_id
                : undefined,
        attempt_id: args.processing_attempt_id,
        lease_expires_at_ms:
            typeof args.event_user.processing_expires_at_ms === "number"
                ? args.event_user.processing_expires_at_ms
                : undefined,
        now_ms: args.now_ms,
    });
}

function getSubscriptionSyncOwnershipFailure(args: {
    state: Record<string, unknown> | null;
    sync_attempt_id?: string;
    now_ms: number;
}) {
    return getExclusiveLeaseOwnershipFailure({
        current_attempt_id:
            typeof args.state?.sync_attempt_id === "string"
                ? args.state.sync_attempt_id
                : undefined,
        attempt_id: args.sync_attempt_id,
        lease_expires_at_ms:
            typeof args.state?.sync_expires_at_ms === "number"
                ? args.state.sync_expires_at_ms
                : undefined,
        now_ms: args.now_ms,
    });
}

function hasUnexpiredPendingActiveSignal(
    state: Record<string, unknown> | null,
    nowMs: number
) {
    return (
        typeof state?.pending_active_expires_at_ms === "number" &&
        state.pending_active_expires_at_ms > nowMs
    );
}

function getNextUserDeletionCleanupStepStartedAtMs(args: {
    operation: UserDeletionQueueEntryDoc;
    cleanup_step: UserDeletionCleanupStep;
    now_ms: number;
}) {
    return args.operation.cleanup_step === args.cleanup_step &&
        typeof args.operation.cleanup_step_started_at_ms === "number"
        ? args.operation.cleanup_step_started_at_ms
        : args.now_ms;
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
    const state = await getLatestSubscriptionStateByUserId(ctx, userId);

    if (!state) {
        return {
            has_active_subscription: false,
            revenuecat_app_user_id: undefined,
            current_quota_period_id: undefined,
            store_subscription_id: undefined,
            store_subscription_period_id: undefined,
        };
    }

    const currentWindow = getSubscriptionWindowFromQuotaPeriodSyncSource(
        buildQuotaPeriodSyncSourceFromSubscriptionState(state)
    );
    const quotaPeriods = await listQuotaPeriodsByUserIdAndWindowKey(
        ctx,
        userId,
        currentWindow.window_key
    );

    const currentQuotaPeriod = await getMostRelevantQuotaPeriodForWindow(
        ctx,
        quotaPeriods,
        currentWindow
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

async function getQuotaPeriodRestorationTargetForDeletedUser(
    ctx: MutationCtx,
    args: {
        deleted_user_id: string;
        frozen_quota_period_id: Doc<"quota_periods">["_id"];
        store_subscription_period_id?: string;
        store_subscription_id?: string;
        store?: string;
        period_start_at_ms: number;
        period_end_at_ms: number;
    }
) {
    const selectTarget = (quotaPeriods: Doc<"quota_periods">[]) =>
        quotaPeriods
            .filter((quotaPeriod) => {
                if (quotaPeriod._id === args.frozen_quota_period_id) {
                    return false;
                }
                if (quotaPeriod.user_id === null || quotaPeriod.user_id === args.deleted_user_id) {
                    return false;
                }
                if (quotaPeriod.status === "frozen") {
                    return false;
                }
                if (quotaPeriod.period_start_at_ms !== args.period_start_at_ms) {
                    return false;
                }
                if (quotaPeriod.period_end_at_ms !== args.period_end_at_ms) {
                    return false;
                }
                if (
                    args.store_subscription_id &&
                    quotaPeriod.store_subscription_id !== args.store_subscription_id
                ) {
                    return false;
                }
                if (args.store && quotaPeriod.store !== args.store) {
                    return false;
                }

                return true;
            })
            .sort((left, right) => right.updated_at_ms - left.updated_at_ms)[0] ?? null;

    if (args.store_subscription_period_id) {
        const quotaPeriods = await ctx.db
            .query("quota_periods")
            .withIndex("by_store_subscription_period_id", (query) =>
                query.eq("store_subscription_period_id", args.store_subscription_period_id)
            )
            .collect();
        const exactTarget = selectTarget(quotaPeriods);

        if (exactTarget) {
            return exactTarget;
        }
    }

    if (!args.store_subscription_id) {
        return null;
    }

    const [openCandidates, closedCandidates] = await Promise.all([
        ctx.db
            .query("quota_periods")
            .withIndex("by_status_and_period_start_at_ms", (query) =>
                query.eq("status", "open").eq("period_start_at_ms", args.period_start_at_ms)
            )
            .collect(),
        ctx.db
            .query("quota_periods")
            .withIndex("by_status_and_period_start_at_ms", (query) =>
                query.eq("status", "closed").eq("period_start_at_ms", args.period_start_at_ms)
            )
            .collect(),
    ]);

    return selectTarget([...openCandidates, ...closedCandidates]);
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

    const planKey: SubscriptionPlanKey = existingState?.plan_key ?? SUBSCRIPTION_PLAN_KEYS.FREE;
    const resolvedPlanLimits = await resolvePlanLimitsForPlanKey(ctx, {
        plan_key: planKey,
        now_ms: args.now_ms,
    });

    const operationLimits = resolveOperationLimits(args.operation, resolvedPlanLimits);
    const freePeriodAnchorAtMs =
        planKey === SUBSCRIPTION_PLAN_KEYS.FREE
            ? resolveFreePeriodAnchorAtMs({
                  existingState,
                  signup_at_ms: args.signup_at_ms,
                  now_ms: args.now_ms,
              })
            : undefined;

    const resolvedWindow =
        planKey === SUBSCRIPTION_PLAN_KEYS.FREE
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

        await ctx.db.patch("quota_periods", quotaPeriod._id, {
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
        await ctx.db.patch("quota_periods", currentQuotaPeriod._id, patch);
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
            await ctx.db.patch("quota_periods", currentQuotaPeriod._id, patch);
        }

        await syncExistingQuotaPeriodCountersForPlanLimits(ctx, {
            quota_period_id: currentQuotaPeriod._id,
            planLimits: args.planLimits,
            now_ms: args.now_ms,
        });

        if (
            args.initial_counter_source_quota_period_id &&
            args.initial_counter_source_quota_period_id !== currentQuotaPeriod._id
        ) {
            await mergeQuotaPeriodCountersIntoTarget(ctx, {
                source_quota_period_id: args.initial_counter_source_quota_period_id,
                target_quota_period_id: currentQuotaPeriod._id,
                now_ms: args.now_ms,
            });
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
        status: "open",
        created_at_ms: args.now_ms,
        updated_at_ms: args.now_ms,
    });

    await closeNonCurrentOpenQuotaPeriodsById(ctx, {
        user_id: args.user_id,
        current_quota_period_id: quotaPeriodId,
        now_ms: args.now_ms,
    });

    const insertedQuotaPeriod = await ctx.db.get("quota_periods", quotaPeriodId);

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
                (quotaContext.planKey === SUBSCRIPTION_PLAN_KEYS.POLYGLOT),
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

async function applyUsageEventChargeToResolvedQuotaPeriod(
    ctx: MutationCtx,
    args: {
        usageEvent: Doc<"usage_events">;
        charged_units: number;
        now_ms: number;
        target_quota_period_id?: Doc<"quota_periods">["_id"];
    }
) {
    const quotaPeriod = await ctx.db.get(
        "quota_periods",
        args.target_quota_period_id ?? args.usageEvent.quota_period_id
    );

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

async function getOutstandingUsageUnitsForQuotaPeriod(
    ctx: MutationCtx,
    args: {
        quota_period_id: Doc<"usage_events">["quota_period_id"];
        operation: SubscriptionUsageOperation;
    }
) {
    let outstandingUnits = 0;

    const reservedUsageEvents = await ctx.db
        .query("usage_events")
        .withIndex("by_quota_period_id_quota_state_operation", (query) =>
            query
                .eq("quota_period_id", args.quota_period_id)
                .eq("quota_state", "reserved")
                .eq("operation", args.operation)
        )
        .collect();

    for (const usageEvent of reservedUsageEvents) {
        outstandingUnits += Math.max(0, Math.floor(usageEvent.reserved_units));
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
export const upsertSubscriptionPlanLimits = async (ctx: MutationCtx, args: WebhookArgs.UpsertSubscriptionPlanLimitsArgs) => {
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
                await ctx.db.patch("subscription_plan_limits", targetDoc._id, nextDocument);
            } else {
                await ctx.db.insert("subscription_plan_limits", nextDocument);
            }

            for (const duplicateDoc of sortedPlanLimits.slice(1)) {
                if (duplicateDoc.is_active) {
                    await ctx.db.patch("subscription_plan_limits", duplicateDoc._id, {
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
    };

export const reserveSubscriptionQuotaUsage = async (ctx: MutationCtx, args: WebhookArgs.ReserveSubscriptionQuotaUsageArgs) => {
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
            quota_unit: INPUT_CHARACTERS_QUOTA_UNIT,
            reserved_units: availabilityResult.sanitized_input_char_count,
            charged_units: 0,
            state: "processing",
            quota_state: "reserved",
            reserved_at_ms: args.now_ms,
            created_at_ms: args.now_ms,
            updated_at_ms: args.now_ms,
        });

        await ctx.scheduler.runAfter(
            QUOTA_USAGE_RESERVATION_WATCHDOG_DELAY_MS,
            internal.webhook.finalizeStaleSubscriptionQuotaUsage,
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
    };

export const chargeSubscriptionQuotaUsage = async (ctx: MutationCtx, args: WebhookArgs.ChargeSubscriptionQuotaUsageArgs) => {
        const usageEvent = await ctx.db.get("usage_events", args.usage_event_id);

        if (!usageEvent) {
            return {
                status: "missing",
            };
        }

        if (usageEvent.quota_state === "charged") {
            return {
                status: "already_charged",
                state: usageEvent.state,
                charged_units: usageEvent.charged_units,
            };
        }

        if (usageEvent.state !== "processing" || usageEvent.quota_state !== "reserved") {
            return {
                status: "invalid_state",
                state: usageEvent.state,
                quota_state: usageEvent.quota_state,
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

        await ctx.db.patch("usage_events", usageEvent._id, {
            quota_state: "charged",
            charged_units: chargedUnits,
            charged_at_ms: args.now_ms,
            updated_at_ms: args.now_ms,
        });

        return {
            status: "charged",
            charged_units: chargedUnits,
        };
    };

export const completeSubscriptionQuotaUsage = async (ctx: MutationCtx, args: WebhookArgs.CompleteSubscriptionQuotaUsageArgs) => {
        const usageEvent = await ctx.db.get("usage_events", args.usage_event_id);

        if (!usageEvent) {
            return {
                status: "missing",
            };
        }

        if (usageEvent.state === "completed") {
            return {
                status: "completed",
            };
        }

        if (!canCompleteUsageEvent(usageEvent)) {
            return {
                status: "invalid_state",
                state: usageEvent.state,
                quota_state: usageEvent.quota_state,
            };
        }

        await ctx.db.patch("usage_events", usageEvent._id, {
            state: "completed",
            completed_at_ms: args.now_ms,
            updated_at_ms: args.now_ms,
        });

        return {
            status: "completed",
        };
    };

export const markSubscriptionQuotaUsageFailed = async (ctx: MutationCtx, args: WebhookArgs.MarkSubscriptionQuotaUsageFailedArgs) => {
        const usageEvent = await ctx.db.get("usage_events", args.usage_event_id);

        if (!usageEvent) {
            return {
                status: "missing",
            };
        }

        if (usageEvent.state === "failed") {
            return {
                status: "failed",
            };
        }

        const transition = resolveUsageEventFailureTransition(usageEvent);

        if (!transition) {
            return {
                status: "invalid_state",
                state: usageEvent.state,
                quota_state: usageEvent.quota_state,
            };
        }

        const patch: MutableUsageEventFields = {
            state: transition.state,
            failed_at_ms: args.now_ms,
            updated_at_ms: args.now_ms,
        };

        if (transition.quota_state === "released") {
            patch.quota_state = transition.quota_state;
            patch.released_at_ms = args.now_ms;
        }

        await ctx.db.patch("usage_events", usageEvent._id, patch);

        return {
            status: "failed",
        };
    };

export const finalizeStaleSubscriptionQuotaUsage = (ctx: MutationCtx, args: WebhookArgs.FinalizeStaleSubscriptionQuotaUsageArgs) => finalizeStaleUsageEvent(ctx, {
            ...args,
            watchdog_delay_ms: QUOTA_USAGE_RESERVATION_WATCHDOG_DELAY_MS,
        });

export const ingestRevenueCatEvent = async (ctx: MutationCtx, args: WebhookArgs.IngestRevenueCatEventArgs) => {
        const existingEvent = await ctx.db
            .query("revenue_cat_events")
            .withIndex("by_event_id", (query) => query.eq("event_id", args.normalized_event.event_id))
            .first();

        if (existingEvent) {
            const targetUserIds = resolveTargetUserIdsFromRevenueCatEvent(existingEvent);
            const existingEventUsers = await listRevenueCatEventUsersByEventDocId(ctx, existingEvent._id);
            const existingLinkedUserIds = new Set(
                existingEventUsers.map((eventUser) => eventUser.user_id)
            );

            for (const userId of targetUserIds) {
                if (existingLinkedUserIds.has(userId)) {
                    continue;
                }

                await ctx.db.insert("revenue_cat_event_users", {
                    event_doc_id: existingEvent._id,
                    user_id: userId,
                    status:
                        existingEvent.status === "processed"
                            ? "processed"
                            : existingEvent.status === "ignored" || existingEvent.status === "dead_letter"
                              ? "ignored"
                              : "pending",
                    created_at_ms: args.received_at_ms,
                    updated_at_ms: args.received_at_ms,
                });
            }

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
    };

export const getRevenueCatEventForProcessing = async (ctx: QueryCtx, args: WebhookArgs.GetRevenueCatEventForProcessingArgs) => {
        const eventDoc = await ctx.db.get("revenue_cat_events", args.event_doc_id);

        if (!eventDoc) {
            return null;
        }

        const eventUsers = await listRevenueCatEventUsersByEventDocId(ctx, eventDoc._id);
        const userSummary = summarizeRevenueCatEventUserState(eventDoc, eventUsers);

        return {
            event_id: eventDoc.event_id,
            event_type: eventDoc.event_type,
            event_at_ms: eventDoc.event_at_ms,
            status: eventDoc.status,
            user_id: eventDoc.user_id,
            transaction_id: eventDoc.transaction_id,
            target_user_ids: userSummary.target_user_ids,
            pending_user_ids: userSummary.pending_user_ids,
            processed_user_ids: userSummary.processed_user_ids,
            ignored_user_ids: userSummary.ignored_user_ids,
        };
    };

export const acquireRevenueCatEventProcessingLeases = async (ctx: MutationCtx, args: WebhookArgs.AcquireRevenueCatEventProcessingLeasesArgs) => {
        const eventDoc = await ctx.db.get("revenue_cat_events", args.event_doc_id);

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
        const acquisitionNowMs = Date.now();
        const leaseExpiresAtMs = acquisitionNowMs + Math.max(0, args.lease_duration_ms);

        for (const userId of requestedUserIds) {
            const eventUser = eventUsersByUserId.get(userId);

            if (!eventUser || eventUser.status !== "pending") {
                continue;
            }

            const eventUserProcessingExpiresAtMs = (eventUser as Record<string, unknown>)
                .processing_expires_at_ms;

            if (
                typeof eventUserProcessingExpiresAtMs === "number" &&
                eventUserProcessingExpiresAtMs > acquisitionNowMs
            ) {
                activeProcessingUserIds.push(userId);
                continue;
            }

            const activeDeletionOperation = await getLatestUserDeletionQueueEntryByUserId(ctx, userId);

            if (doesUserDeletionStatusBlockRevenueCatReconciliation(activeDeletionOperation?.status)) {
                blockedUserIds.push(userId);
                continue;
            }

            await ctx.db.patch("revenue_cat_event_users", eventUser._id, {
                processing_attempt_id: args.processing_attempt_id,
                processing_started_at_ms: acquisitionNowMs,
                processing_expires_at_ms: leaseExpiresAtMs,
                updated_at_ms: acquisitionNowMs,
            } as Record<string, unknown>);

            acquiredUserIds.push(userId);
        }

        return {
            status: eventDoc.status,
            acquired_user_ids: acquiredUserIds,
            active_processing_user_ids: activeProcessingUserIds,
            blocked_user_ids: blockedUserIds,
        };
    };


async function getActiveRevenueCatEventProcessingForUserDeletionSnapshot(
    ctx: DbReaderCtx,
    args: {
        user_id: string;
        now_ms: number;
        limit: number;
    }
) {
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
}
export const getActiveRevenueCatEventProcessingForUserDeletion = async (ctx: QueryCtx, args: WebhookArgs.GetActiveRevenueCatEventProcessingForUserDeletionArgs) => {
        return getActiveRevenueCatEventProcessingForUserDeletionSnapshot(ctx, args);
    };

export const recordRevenueCatEventProcessingProgress = async (ctx: MutationCtx, args: WebhookArgs.RecordRevenueCatEventProcessingProgressArgs) => {
        const eventDoc = await ctx.db.get("revenue_cat_events", args.event_doc_id);

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
        const ownershipCheckNowMs = Date.now();
        const touchedPendingUserIds = normalizeRevenueCatEventUserIds([
            ...processedUserIds,
            ...ignoredUserIds,
            ...releasedUserIds,
        ]).filter((userId) => eventUsersByUserId.get(userId)?.status === "pending");

        for (const userId of touchedPendingUserIds) {
            const eventUser = eventUsersByUserId.get(userId);

            if (!eventUser) {
                continue;
            }

            const ownershipFailure = getRevenueCatEventProcessingOwnershipFailure({
                event_user: eventUser as Record<string, unknown>,
                processing_attempt_id: args.processing_attempt_id,
                now_ms: ownershipCheckNowMs,
            });

            if (ownershipFailure) {
                const userSummary = summarizeRevenueCatEventUserState(eventDoc, allEventUsers);

                return {
                    status: eventDoc.status,
                    pending_user_ids: userSummary.pending_user_ids,
                    processed_user_ids: userSummary.processed_user_ids,
                    ignored_user_ids: userSummary.ignored_user_ids,
                    owner_mismatch:
                        ownershipFailure === "owner_required" ||
                        ownershipFailure === "owner_mismatch",
                    lease_expired: ownershipFailure === "lease_expired",
                    ownership_failure: ownershipFailure,
                };
            }
        }

        for (const userId of processedUserIds) {
            const eventUser = eventUsersByUserId.get(userId);

            if (!eventUser || eventUser.status !== "pending") {
                continue;
            }

            await ctx.db.patch("revenue_cat_event_users", eventUser._id, {
                status: "processed",
                processing_attempt_id: undefined,
                processing_started_at_ms: undefined,
                processing_expires_at_ms: undefined,
                updated_at_ms: args.now_ms,
            } as Record<string, unknown>);
        }

        for (const userId of ignoredUserIds) {
            const eventUser = eventUsersByUserId.get(userId);

            if (!eventUser || eventUser.status !== "pending") {
                continue;
            }

            await ctx.db.patch("revenue_cat_event_users", eventUser._id, {
                status: "ignored",
                processing_attempt_id: undefined,
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

            await ctx.db.patch("revenue_cat_event_users", eventUser._id, {
                processing_attempt_id: undefined,
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
                        ? (args.status_message ?? args.error_message).slice(0, MAX_PERSISTED_ERROR_MESSAGE_CHARS)
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
                patch.last_error = args.error_message.slice(0, MAX_PERSISTED_ERROR_MESSAGE_CHARS);
            }
        } else if (userSummary.pending_user_ids.length > 0) {
            patch.status = "pending";
            patch.next_retry_at_ms = args.next_retry_at_ms ?? args.now_ms;
            patch.processed_at_ms = undefined;
            patch.last_error = args.status_message?.slice(0, MAX_PERSISTED_ERROR_MESSAGE_CHARS);
        } else {
            patch.status = userSummary.processed_user_ids.length > 0 ? "processed" : "ignored";
            patch.retry_count = 0;
            patch.next_retry_at_ms = args.now_ms;
            patch.processed_at_ms = args.now_ms;
            patch.last_error =
                patch.status === "ignored"
                    ? args.status_message?.slice(0, MAX_PERSISTED_ERROR_MESSAGE_CHARS)
                    : undefined;
        }

        await ctx.db.patch("revenue_cat_events", eventDoc._id, patch);

        return {
            status: patch.status,
            pending_user_ids: userSummary.pending_user_ids,
            processed_user_ids: userSummary.processed_user_ids,
            ignored_user_ids: userSummary.ignored_user_ids,
        };
    };

export const listRetryableRevenueCatEvents = async (ctx: QueryCtx, args: WebhookArgs.ListRetryableRevenueCatEventsArgs) => {
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
    };

export const listRevenueCatEventsForStatus = async (ctx: QueryCtx, args: WebhookArgs.ListRevenueCatEventsForStatusArgs) => {
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
    };

export const listRevenueCatEventsEligibleForRetentionPurge = async (ctx: QueryCtx, args: WebhookArgs.ListRevenueCatEventsEligibleForRetentionPurgeArgs) => {
        const safeLimit = Math.max(1, Math.min(args.limit, 500));

        const docs = await ctx.db
            .query("revenue_cat_events")
            .withIndex("by_status_and_updated_at_ms", (query) =>
                query.eq("status", args.status).lte("updated_at_ms", args.older_than_ms)
            )
            .take(safeLimit);

        return docs.map((doc) => doc._id);
    };

export const purgeRevenueCatEventsById = async (ctx: MutationCtx, args: WebhookArgs.PurgeRevenueCatEventsByIdArgs) => {
        let deletedCount = 0;

        for (const eventDocId of args.event_doc_ids) {
            const eventDoc = await ctx.db.get("revenue_cat_events", eventDocId);

            if (eventDoc && !PROCESSED_EVENT_STATUSES.has(eventDoc.status)) {
                continue;
            }

            await deleteRevenueCatEventUsersByEventDocId(ctx, eventDocId);

            if (eventDoc) {
                await ctx.db.delete("revenue_cat_events", eventDocId);
                deletedCount += 1;
            }
        }

        return {
            deleted_count: deletedCount,
        };
    };

export const deleteFrozenQuotaPeriodsEligibleForRetentionPurge = async (ctx: MutationCtx, args: WebhookArgs.DeleteFrozenQuotaPeriodsEligibleForRetentionPurgeArgs) => {
        const safeLimit = Math.max(1, Math.min(args.limit, 500));
        const quotaPeriods = await ctx.db
            .query("quota_periods")
            .withIndex("by_status_user_id_and_period_end_at_ms", (query) =>
                query
                    .eq("status", "frozen")
                    .eq("user_id", null)
                    .lte("period_end_at_ms", args.older_than_ms)
            )
            .take(safeLimit);
        let deletedCount = 0;
        let retainedLinkedCount = 0;

        for (const quotaPeriod of quotaPeriods) {
            await deleteQuotaPeriodCountersByQuotaPeriodId(ctx, quotaPeriod._id);
            await ctx.db.delete("quota_periods", quotaPeriod._id);
            deletedCount += 1;
        }

        return {
            scanned_count: quotaPeriods.length,
            deleted_count: deletedCount,
            retained_linked_count: retainedLinkedCount,
        };
    };

export const consumeRefreshRateLimit = async (ctx: MutationCtx, args: WebhookArgs.ConsumeRefreshRateLimitArgs) => {
        const requestBucket: RefreshRateLimitBucketPlan = args.expects_active_subscription
            ? {
                  kind: "refresh_purchase",
                  window_ms: args.config.purchase_window_ms,
                  max_count: args.config.purchase_max_count,
              }
            : {
                  kind: "refresh_normal",
                  window_ms: args.config.normal_window_ms,
                  max_count: args.config.normal_max_count,
              };
        const bucketPlans: RefreshRateLimitBucketPlan[] = [
            requestBucket,
            {
                kind: "refresh_daily",
                window_ms: args.config.daily_window_ms,
                max_count: args.config.daily_max_count,
            },
        ];
        const bucketStates: RefreshRateLimitBucketState[] = [];

        for (const plan of bucketPlans) {
            bucketStates.push(
                await getRefreshRateLimitBucketState(ctx, args.user_id, plan, args.now_ms)
            );
        }

        const limitedBuckets = bucketStates.filter((state) => state.count >= state.max_count);

        if (limitedBuckets.length > 0) {
            for (const bucketState of bucketStates) {
                await persistRefreshRateLimitBucketState(
                    ctx,
                    args.user_id,
                    bucketState,
                    bucketState.count,
                    args.now_ms
                );
            }

            const retryAfterMs = Math.max(
                0,
                ...limitedBuckets.map((state) => state.window_end_ms - args.now_ms)
            );
            const limitedBucket = limitedBuckets.sort(
                (left, right) => right.window_end_ms - left.window_end_ms
            )[0];

            return {
                allowed: false as const,
                limited_kind: limitedBucket.kind,
                retry_after_ms: retryAfterMs,
                window_end_ms: limitedBucket.window_end_ms,
            };
        }

        for (const bucketState of bucketStates) {
            await persistRefreshRateLimitBucketState(
                ctx,
                args.user_id,
                bucketState,
                bucketState.count + 1,
                args.now_ms
            );
        }

        return {
            allowed: true as const,
        };
    };

export const deleteRefreshRateLimitsEligibleForRetentionPurge = async (ctx: MutationCtx, args: WebhookArgs.DeleteRefreshRateLimitsEligibleForRetentionPurgeArgs) => {
        const safeLimit = Math.max(1, Math.min(args.limit, 500));
        const docs = await ctx.db
            .query("refresh_rate_limits")
            .withIndex("by_updated_at_ms", (query) =>
                query.lte("updated_at_ms", args.older_than_ms)
            )
            .take(safeLimit);

        for (const doc of docs) {
            await ctx.db.delete("refresh_rate_limits", doc._id);
        }

        return {
            scanned_count: docs.length,
            deleted_count: docs.length,
        };
    };

export const getSubscriptionStateByUserId = async (ctx: QueryCtx, args: WebhookArgs.GetSubscriptionStateByUserIdArgs) => {
        const state = await getLatestSubscriptionStateByUserId(ctx, args.user_id);

        if (!state) {
            return null;
        }

        const stateRecord = state as Record<string, unknown>;

        return {
            user_id: state.user_id,
            revenuecat_app_user_id: state.revenuecat_app_user_id,
            plan_key: state.plan_key,
            has_active_subscription: state.has_active_subscription,
            store_subscription_id: state.store_subscription_id,
            store_subscription_period_id: state.store_subscription_period_id,
            billing_cycle_end_at_ms: state.billing_cycle_end_at_ms,
            last_revenuecat_event_id: state.last_revenuecat_event_id,
            last_revenuecat_event_at_ms: state.last_revenuecat_event_at_ms,
            sync_attempt_id:
                typeof stateRecord.sync_attempt_id === "string"
                    ? stateRecord.sync_attempt_id
                    : undefined,
            sync_started_at_ms:
                typeof stateRecord.sync_started_at_ms === "number"
                    ? stateRecord.sync_started_at_ms
                    : undefined,
            sync_expires_at_ms:
                typeof stateRecord.sync_expires_at_ms === "number"
                    ? stateRecord.sync_expires_at_ms
                    : undefined,
            pending_active_signal_at_ms:
                typeof stateRecord.pending_active_signal_at_ms === "number"
                    ? stateRecord.pending_active_signal_at_ms
                    : undefined,
            pending_active_expires_at_ms:
                typeof stateRecord.pending_active_expires_at_ms === "number"
                    ? stateRecord.pending_active_expires_at_ms
                    : undefined,
            last_synced_at_ms: state.last_synced_at_ms,
            stale_after_at_ms: state.stale_after_at_ms,
        };
    };

export const beginSubscriptionStateReconciliation = async (ctx: MutationCtx, args: WebhookArgs.BeginSubscriptionStateReconciliationArgs) => {
        const existingState = await getLatestSubscriptionStateByUserId(ctx, args.user_id);
        const existingStateRecord = existingState as Record<string, unknown> | null;
        const nowMs = args.now_ms;
        const safeLeaseDurationMs = Math.max(
            1,
            Math.min(args.lease_duration_ms, SUBSCRIPTION_SYNC_LEASE_MAX_MS)
        );
        const leaseExpiresAtMs = nowMs + safeLeaseDurationMs;
        const activeSignalTtlMs = Math.min(
            Math.max(0, args.active_signal_ttl_ms ?? 0),
            PENDING_ACTIVE_SIGNAL_MAX_TTL_MS
        );
        const signalAtMs = Math.min(args.active_signal_at_ms ?? nowMs, nowMs);
        const activeSignalExpiresAtMs = signalAtMs + activeSignalTtlMs;
        const shouldRecordActiveSignal =
            args.expects_active_subscription === true &&
            activeSignalExpiresAtMs > nowMs &&
            (args.trusted_active_signal === true || existingState?.has_active_subscription !== true);
        const existingPendingExpiresAtMs =
            typeof existingStateRecord?.pending_active_expires_at_ms === "number"
                ? existingStateRecord.pending_active_expires_at_ms
                : undefined;
        const existingPendingIsLive =
            typeof existingPendingExpiresAtMs === "number" && existingPendingExpiresAtMs > nowMs;
        const nextPendingActiveSignalAtMs = shouldRecordActiveSignal
            ? Math.max(
                  typeof existingStateRecord?.pending_active_signal_at_ms === "number"
                      ? existingStateRecord.pending_active_signal_at_ms
                      : 0,
                  signalAtMs
              )
            : existingPendingIsLive
              ? typeof existingStateRecord?.pending_active_signal_at_ms === "number"
                  ? existingStateRecord.pending_active_signal_at_ms
                  : undefined
              : undefined;
        const nextPendingActiveExpiresAtMs = shouldRecordActiveSignal
            ? Math.max(
                  existingPendingIsLive ? existingPendingExpiresAtMs : 0,
                  signalAtMs + activeSignalTtlMs
              )
            : existingPendingIsLive
              ? existingPendingExpiresAtMs
              : undefined;
        const pendingActivePatch = {
            ...(typeof nextPendingActiveSignalAtMs === "number"
                ? { pending_active_signal_at_ms: nextPendingActiveSignalAtMs }
                : { pending_active_signal_at_ms: undefined }),
            ...(typeof nextPendingActiveExpiresAtMs === "number"
                ? { pending_active_expires_at_ms: nextPendingActiveExpiresAtMs }
                : { pending_active_expires_at_ms: undefined }),
        } as Record<string, unknown>;

        if (existingState) {
            const currentSyncAttemptId =
                typeof existingStateRecord?.sync_attempt_id === "string"
                    ? existingStateRecord.sync_attempt_id
                    : undefined;
            const currentSyncExpiresAtMs =
                typeof existingStateRecord?.sync_expires_at_ms === "number"
                    ? existingStateRecord.sync_expires_at_ms
                    : undefined;
            const isOwnedByAnotherLiveAttempt =
                typeof currentSyncAttemptId === "string" &&
                currentSyncAttemptId !== args.sync_attempt_id &&
                typeof currentSyncExpiresAtMs === "number" &&
                currentSyncExpiresAtMs > nowMs;

            if (isOwnedByAnotherLiveAttempt) {
                if (shouldRecordActiveSignal || !existingPendingIsLive) {
                    await ctx.db.patch("subscription_states", existingState._id, {
                        ...pendingActivePatch,
                        updated_at_ms: nowMs,
                    });
                }

                return {
                    status: "in_progress" as const,
                    revenuecat_app_user_id:
                        existingState.revenuecat_app_user_id ?? args.revenuecat_app_user_id,
                    retry_at_ms: currentSyncExpiresAtMs,
                    has_active_subscription: existingState.has_active_subscription,
                    plan_key: existingState.plan_key,
                    last_synced_at_ms: existingState.last_synced_at_ms,
                    ...(typeof existingState.billing_cycle_end_at_ms === "number"
                        ? { billing_cycle_end_at_ms: existingState.billing_cycle_end_at_ms }
                        : {}),
                };
            }

            await ctx.db.patch("subscription_states", existingState._id, {
                revenuecat_app_user_id:
                    existingState.revenuecat_app_user_id ?? args.revenuecat_app_user_id,
                sync_attempt_id: args.sync_attempt_id,
                sync_started_at_ms: nowMs,
                sync_expires_at_ms: leaseExpiresAtMs,
                ...pendingActivePatch,
                updated_at_ms: nowMs,
            });

            return {
                status: "acquired" as const,
                revenuecat_app_user_id:
                    existingState.revenuecat_app_user_id ?? args.revenuecat_app_user_id,
                has_active_subscription: existingState.has_active_subscription,
                plan_key: existingState.plan_key,
                last_synced_at_ms: existingState.last_synced_at_ms,
                ...(typeof existingState.billing_cycle_end_at_ms === "number"
                    ? { billing_cycle_end_at_ms: existingState.billing_cycle_end_at_ms }
                    : {}),
            };
        }

        const freePeriodAnchorAtMs = args.signup_at_ms ?? nowMs;
        const resolvedWindow = getRequiredAnchoredMonthlyWindow(freePeriodAnchorAtMs, nowMs);
        const stateDoc = {
            user_id: args.user_id,
            revenuecat_app_user_id: args.revenuecat_app_user_id,
            plan_key: SUBSCRIPTION_PLAN_KEYS.FREE,
            has_active_subscription: false,
            free_period_anchor_at_ms: freePeriodAnchorAtMs,
            window_type: resolvedWindow.window_type,
            window_key: resolvedWindow.window_key,
            window_start_at_ms: resolvedWindow.window_start_at_ms,
            window_end_at_ms: resolvedWindow.window_end_at_ms,
            sync_attempt_id: args.sync_attempt_id,
            sync_started_at_ms: nowMs,
            sync_expires_at_ms: leaseExpiresAtMs,
            ...pendingActivePatch,
            last_synced_at_ms: 0,
            stale_after_at_ms: nowMs,
            created_at_ms: nowMs,
            updated_at_ms: nowMs,
        };

        await ctx.db.insert("subscription_states", stateDoc as any);

        return {
            status: "acquired" as const,
            revenuecat_app_user_id: args.revenuecat_app_user_id,
            has_active_subscription: false,
            plan_key: SUBSCRIPTION_PLAN_KEYS.FREE,
            last_synced_at_ms: 0,
        };
    };

export const releaseSubscriptionStateReconciliation = async (ctx: MutationCtx, args: WebhookArgs.ReleaseSubscriptionStateReconciliationArgs) => {
        const existingState = await getLatestSubscriptionStateByUserId(ctx, args.user_id);
        const ownershipFailure = getSubscriptionSyncOwnershipFailure({
            state: existingState as Record<string, unknown> | null,
            sync_attempt_id: args.sync_attempt_id,
            now_ms: args.now_ms,
        });

        if (!existingState || ownershipFailure) {
            return {
                status: existingState ? ("not_owner" as const) : ("missing" as const),
                owner_mismatch:
                    ownershipFailure === "owner_required" || ownershipFailure === "owner_mismatch",
                lease_expired: ownershipFailure === "lease_expired",
                ownership_failure: ownershipFailure,
            };
        }

        await ctx.db.patch("subscription_states", existingState._id, {
            sync_attempt_id: undefined,
            sync_started_at_ms: undefined,
            sync_expires_at_ms: undefined,
            ...(typeof args.next_attempt_at_ms === "number"
                ? { stale_after_at_ms: args.next_attempt_at_ms }
                : {}),
            updated_at_ms: Math.max(existingState.updated_at_ms, args.now_ms),
        } as Record<string, unknown>);

        return {
            status: "released" as const,
        };
    };

export const getUserDeletionSnapshot = async (ctx: QueryCtx, args: WebhookArgs.GetUserDeletionSnapshotArgs) => {
        return getUserDeletionSnapshotRecordByUserId(ctx, args.user_id);
    };

export const ensureUserDeletionPreservedQuotaPeriod = async (ctx: MutationCtx, args: WebhookArgs.EnsureUserDeletionPreservedQuotaPeriodArgs) => {
        const state = await getLatestSubscriptionStateByUserId(ctx, args.user_id);

        if (!state || !state.has_active_subscription) {
            return getUserDeletionSnapshotRecordByUserId(ctx, args.user_id);
        }

        const currentWindow = getSubscriptionWindowFromQuotaPeriodSyncSource(
            buildQuotaPeriodSyncSourceFromSubscriptionState(state)
        );
        const quotaPeriods = await listQuotaPeriodsByUserIdAndWindowKey(
            ctx,
            args.user_id,
            currentWindow.window_key
        );
        const currentQuotaPeriod = await getMostRelevantQuotaPeriodForWindow(
            ctx,
            quotaPeriods,
            currentWindow
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
    };

export const getUserDeletionOperationState = async (ctx: QueryCtx, args: WebhookArgs.GetUserDeletionOperationStateArgs) => {
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
            revenuecat_deleted_at_ms: operation?.revenuecat_deleted_at_ms,
            next_retry_at_ms: operation?.next_retry_at_ms,
            retry_count: operation?.retry_count,
            cleanup_attempt_id: operation?.cleanup_attempt_id,
            cleanup_step: operation?.cleanup_step,
            cleanup_step_started_at_ms: operation?.cleanup_step_started_at_ms,
            cleanup_lease_expires_at_ms: operation?.cleanup_lease_expires_at_ms,
            updated_at_ms: operation?.updated_at_ms,
            revenuecat_app_user_id: operation?.revenuecat_app_user_id,
            has_active_subscription: operation?.has_active_subscription,
            preserved_quota_period_id: operation?.preserved_quota_period_id,
            store_subscription_id: operation?.store_subscription_id,
            store_subscription_period_id: operation?.store_subscription_period_id,
        };
    };

export const listDueUserDeletionOperations = async (ctx: QueryCtx, args: WebhookArgs.ListDueUserDeletionOperationsArgs) => {
        const safeLimit = Math.max(1, Math.min(args.limit, 50));
        const candidateEntries = (
            await Promise.all(
                AUTOMATIC_USER_DELETION_RETRY_STATUSES.map((status) =>
                    ctx.db
                        .query("user_deletion_queue")
                        .withIndex("by_status_and_next_retry_at_ms", (query) =>
                            query.eq("status", status).lte("next_retry_at_ms", args.now_ms)
                        )
                        .take(safeLimit)
                )
            )
        ).flat();
        const entriesByUserId = new Map<string, UserDeletionQueueEntryDoc>();

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
    };

export const listAuthDeleteDeadLetterUserDeletionOperations = async (ctx: QueryCtx, args: WebhookArgs.ListAuthDeleteDeadLetterUserDeletionOperationsArgs) => {
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
    };

export const listCleanupDeadLetterUserDeletionOperations = async (ctx: QueryCtx, args: WebhookArgs.ListCleanupDeadLetterUserDeletionOperationsArgs) => {
        const safeLimit = Math.max(1, Math.min(args.limit, 50));
        const mapEntry = (entry: Doc<"user_deletion_queue">) => ({
            user_id: entry.user_id,
            status: entry.status,
            retry_count: entry.retry_count,
            next_retry_at_ms: entry.next_retry_at_ms,
            last_error: entry.last_error,
            updated_at_ms: entry.updated_at_ms,
        });

        if (typeof args.user_id === "string") {
            const entry = await getLatestUserDeletionQueueEntryByUserId(ctx, args.user_id);

            if (!entry || entry.status !== USER_DELETION_CLEANUP_DEAD_LETTER_STATUS) {
                return [];
            }

            if (typeof args.now_ms === "number" && entry.next_retry_at_ms > args.now_ms) {
                return [];
            }

            return [mapEntry(entry)];
        }

        const dueOnlyNowMs = args.now_ms;
        const entries = typeof dueOnlyNowMs === "number"
            ? await ctx.db
                  .query("user_deletion_queue")
                  .withIndex("by_status_and_next_retry_at_ms", (query) =>
                      query
                          .eq("status", USER_DELETION_CLEANUP_DEAD_LETTER_STATUS)
                          .lte("next_retry_at_ms", dueOnlyNowMs)
                  )
                  .order("asc")
                  .take(safeLimit * 3)
            : await ctx.db
                  .query("user_deletion_queue")
                  .withIndex("by_status_and_updated_at_ms", (query) =>
                      query.eq("status", USER_DELETION_CLEANUP_DEAD_LETTER_STATUS)
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
            .filter(
                (entry) =>
                    typeof args.now_ms !== "number" || entry.next_retry_at_ms <= args.now_ms
            )
            .sort((left, right) => left.updated_at_ms - right.updated_at_ms)
            .slice(0, safeLimit)
            .map(mapEntry);
    };

export const getActiveUserDeletionUsageEventCount = async (ctx: QueryCtx, args: WebhookArgs.GetActiveUserDeletionUsageEventCountArgs) => {
        const activeUsageEvents = await listActiveUsageEventsByUserIdBatch(ctx, args.user_id, 1);

        return {
            active_usage_event_count: activeUsageEvents.length,
        };
    };

export const listSubscriptionStatesDueForExpirationReconciliation = async (ctx: QueryCtx, args: WebhookArgs.ListSubscriptionStatesDueForExpirationReconciliationArgs) => {
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
    };

export const applyReconciledSubscriptionState = async (ctx: MutationCtx, args: WebhookArgs.ApplyReconciledSubscriptionStateArgs) => {
        if (args.allow_user_deletion_in_progress !== true) {
            const activeDeletionOperation = await getLatestUserDeletionQueueEntryByUserId(ctx, args.user_id);

            if (doesUserDeletionStatusBlockProcessing(activeDeletionOperation?.status)) {
                throw new Error("Cannot apply subscription state while user deletion is in progress");
            }
        }

        const existingState = await getLatestSubscriptionStateByUserId(ctx, args.user_id);
        const existingStateRecord = existingState as Record<string, unknown> | null;
        const ownershipCheckNowMs = Date.now();

        const ownershipFailure = getSubscriptionSyncOwnershipFailure({
            state: existingStateRecord,
            sync_attempt_id: args.sync_attempt_id,
            now_ms: ownershipCheckNowMs,
        });

        if (ownershipFailure) {
            return {
                status: "unchanged" as const,
                plan_key: existingState?.plan_key ?? SUBSCRIPTION_PLAN_KEYS.FREE,
                has_active_subscription: existingState?.has_active_subscription ?? false,
                last_synced_at_ms: existingState?.last_synced_at_ms ?? 0,
                owner_mismatch:
                    ownershipFailure === "owner_required" || ownershipFailure === "owner_mismatch",
                lease_expired: ownershipFailure === "lease_expired",
                ownership_failure: ownershipFailure,
                ...(typeof existingState?.billing_cycle_end_at_ms === "number"
                    ? { billing_cycle_end_at_ms: existingState.billing_cycle_end_at_ms }
                    : {}),
            };
        }

        if (existingState && shouldIgnoreStaleReconciledSubscriptionState(existingState, args.synced_at_ms)) {
            await ctx.db.patch("subscription_states", existingState._id, {
                sync_attempt_id: undefined,
                sync_started_at_ms: undefined,
                sync_expires_at_ms: undefined,
                updated_at_ms: Math.max(existingState.updated_at_ms, args.synced_at_ms),
            } as Record<string, unknown>);

            return {
                status: "unchanged" as const,
                plan_key: existingState.plan_key,
                has_active_subscription: existingState.has_active_subscription,
                last_synced_at_ms: existingState.last_synced_at_ms,
                owner_mismatch: false,
                lease_expired: false,
                ...(typeof existingState.billing_cycle_end_at_ms === "number"
                    ? { billing_cycle_end_at_ms: existingState.billing_cycle_end_at_ms }
                    : {}),
            };
        }

        const safeActiveSignalAtMs = Math.min(
            args.active_signal_at_ms ?? args.synced_at_ms,
            args.synced_at_ms
        );
        const activeSignalTtlMs = Math.min(
            Math.max(0, args.active_signal_ttl_ms ?? 0),
            PENDING_ACTIVE_SIGNAL_MAX_TTL_MS
        );
        const activeSignalExpiresAtMs = safeActiveSignalAtMs + activeSignalTtlMs;
        const activeSignalCanHoldInactive =
            args.expects_active_subscription === true &&
            activeSignalExpiresAtMs > args.synced_at_ms &&
            (args.trusted_active_signal === true || existingState?.has_active_subscription !== true);
        const shouldHoldInactiveForActiveSignal =
            !args.snapshot.has_active_subscription &&
            (activeSignalCanHoldInactive ||
                hasUnexpiredPendingActiveSignal(existingStateRecord, args.synced_at_ms));

        if (shouldHoldInactiveForActiveSignal && existingState) {
            const existingPendingSignalAtMs =
                typeof existingStateRecord?.pending_active_signal_at_ms === "number"
                    ? existingStateRecord.pending_active_signal_at_ms
                    : undefined;
            const existingPendingExpiresAtMs =
                typeof existingStateRecord?.pending_active_expires_at_ms === "number"
                    ? existingStateRecord.pending_active_expires_at_ms
                    : undefined;
            const signalAtMs = activeSignalCanHoldInactive
                ? Math.max(
                      existingPendingSignalAtMs ?? 0,
                      safeActiveSignalAtMs
                  )
                : existingPendingSignalAtMs ?? args.synced_at_ms;
            const nextPendingActiveExpiresAtMs = activeSignalCanHoldInactive
                ? Math.max(
                      typeof existingPendingExpiresAtMs === "number" &&
                          existingPendingExpiresAtMs > args.synced_at_ms
                          ? existingPendingExpiresAtMs
                          : 0,
                      signalAtMs + activeSignalTtlMs
                  )
                : existingPendingExpiresAtMs ?? args.synced_at_ms;

            await ctx.db.patch("subscription_states", existingState._id, {
                sync_attempt_id: undefined,
                sync_started_at_ms: undefined,
                sync_expires_at_ms: undefined,
                pending_active_signal_at_ms: signalAtMs,
                pending_active_expires_at_ms: nextPendingActiveExpiresAtMs,
                updated_at_ms: args.synced_at_ms,
            } as Record<string, unknown>);

            return {
                status: "pending_active" as const,
                plan_key: existingState.plan_key,
                has_active_subscription: existingState.has_active_subscription,
                last_synced_at_ms: existingState.last_synced_at_ms,
                pending_active_expires_at_ms: nextPendingActiveExpiresAtMs,
                owner_mismatch: false,
                lease_expired: false,
                ...(typeof existingState.billing_cycle_end_at_ms === "number"
                    ? { billing_cycle_end_at_ms: existingState.billing_cycle_end_at_ms }
                    : {}),
            };
        }

        const hasActiveSubscription = args.snapshot.has_active_subscription;
        const planKey: SubscriptionPlanKey = hasActiveSubscription
            ? SUBSCRIPTION_PLAN_KEYS.POLYGLOT
            : SUBSCRIPTION_PLAN_KEYS.FREE;

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
            ...(() => {
                const existingEventAtMs = existingState?.last_revenuecat_event_at_ms;
                const shouldApplyIncomingEvent =
                    typeof args.revenuecat_event_id === "string" &&
                    (typeof existingEventAtMs !== "number" ||
                        typeof args.revenuecat_event_at_ms !== "number" ||
                        args.revenuecat_event_at_ms >= existingEventAtMs);

                if (shouldApplyIncomingEvent) {
                    return {
                        last_revenuecat_event_id: args.revenuecat_event_id,
                        ...(typeof args.revenuecat_event_at_ms === "number"
                            ? { last_revenuecat_event_at_ms: args.revenuecat_event_at_ms }
                            : {}),
                    };
                }

                return {
                    ...(existingState?.last_revenuecat_event_id
                        ? { last_revenuecat_event_id: existingState.last_revenuecat_event_id }
                        : {}),
                    ...(typeof existingEventAtMs === "number"
                        ? { last_revenuecat_event_at_ms: existingEventAtMs }
                        : {}),
                };
            })(),
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
            await ctx.db.replace("subscription_states", existingState._id, nextState);
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
            await ctx.db.patch("quota_periods", restorableFrozenQuotaPeriod._id, {
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
            owner_mismatch: false,
            lease_expired: false,
        };
    };

export const startUserDeletionOperation = async (ctx: MutationCtx, args: WebhookArgs.StartUserDeletionOperationArgs) => {
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
    };

export const clearUserDeletionOperation = async (ctx: MutationCtx, args: WebhookArgs.ClearUserDeletionOperationArgs) => {
        const operations = await listUserDeletionQueueEntriesByUserId(ctx, args.user_id);
        const latestOperation = getLatestUserDeletionQueueEntry(operations);

        if (
            typeof args.cleanup_attempt_id !== "string" &&
            latestOperation?.status === "cleanup_in_progress" &&
            typeof latestOperation.cleanup_attempt_id === "string"
        ) {
            return {
                deleted_count: 0,
                owner_mismatch: true,
                lease_expired: false,
                ownership_failure: "owner_required" as const,
            };
        }

        const ownershipFailure = getUserDeletionCleanupOwnershipFailure({
            operation: latestOperation,
            cleanup_attempt_id: args.cleanup_attempt_id,
            now_ms: args.now_ms,
        });

        if (ownershipFailure) {
            return {
                deleted_count: 0,
                owner_mismatch:
                    ownershipFailure === "owner_mismatch" || ownershipFailure === "not_in_progress",
                lease_expired: ownershipFailure === "lease_expired",
                ownership_failure: ownershipFailure,
            };
        }

        for (const operation of operations) {
            await ctx.db.delete("user_deletion_queue", operation._id);
        }

        return {
            deleted_count: operations.length,
            owner_mismatch: false,
            lease_expired: false,
        };
    };

export const upsertUserDeletionPreparation = async (ctx: MutationCtx, args: WebhookArgs.UpsertUserDeletionPreparationArgs) => {
        assertRequiredPreservedQuotaPeriod({
            user_id: args.user_id,
            has_active_subscription: args.has_active_subscription,
            preserved_quota_period_id: args.preserved_quota_period_id,
        });

        const latestOperation = await getLatestUserDeletionQueueEntryByUserId(ctx, args.user_id);
        const preserveCleanupLease = latestOperation?.status === "cleanup_in_progress";
        const ownerRequired =
            preserveCleanupLease &&
            typeof latestOperation.cleanup_attempt_id === "string" &&
            typeof args.cleanup_attempt_id !== "string";
        const ownershipFailure = preserveCleanupLease
            ? getUserDeletionCleanupOwnershipFailure({
                  operation: latestOperation,
                  cleanup_attempt_id: args.cleanup_attempt_id,
                  now_ms: args.now_ms ?? args.prepared_at_ms,
              })
            : null;

        if (ownerRequired || ownershipFailure) {
            return {
                updated: false,
                owner_mismatch:
                    ownerRequired ||
                    ownershipFailure === "owner_mismatch" ||
                    ownershipFailure === "not_in_progress",
                lease_expired: ownershipFailure === "lease_expired",
                ownership_failure: ownerRequired ? "owner_required" : ownershipFailure,
                has_active_subscription: latestOperation?.has_active_subscription,
                revenuecat_app_user_id: latestOperation?.revenuecat_app_user_id,
                preserved_quota_period_id: latestOperation?.preserved_quota_period_id,
                store_subscription_id: latestOperation?.store_subscription_id,
                store_subscription_period_id: latestOperation?.store_subscription_period_id,
            };
        }

        const nextPreparation = buildUserDeletionQueueEntry({
            user_id: args.user_id,
            status: preserveCleanupLease
                ? "cleanup_in_progress"
                : latestOperation?.auth_deleted_at_ms
                  ? "ready_for_cleanup"
                  : "awaiting_auth_delete",
            started_at_ms: latestOperation?.started_at_ms ?? args.prepared_at_ms,
            prepared_at_ms: args.prepared_at_ms,
            auth_deleted_at_ms: latestOperation?.auth_deleted_at_ms,
            revenuecat_deleted_at_ms: latestOperation?.revenuecat_deleted_at_ms,
            next_retry_at_ms: latestOperation?.next_retry_at_ms ?? args.prepared_at_ms,
            retry_count: latestOperation?.retry_count ?? 0,
            cleanup_attempt_id: preserveCleanupLease
                ? latestOperation.cleanup_attempt_id
                : undefined,
            cleanup_step: preserveCleanupLease ? latestOperation.cleanup_step : undefined,
            cleanup_step_started_at_ms: preserveCleanupLease
                ? latestOperation.cleanup_step_started_at_ms
                : undefined,
            cleanup_lease_expires_at_ms: preserveCleanupLease
                ? latestOperation.cleanup_lease_expires_at_ms
                : undefined,
            revenuecat_app_user_id:
                args.revenuecat_app_user_id ?? latestOperation?.revenuecat_app_user_id,
            has_active_subscription: args.has_active_subscription,
            preserved_quota_period_id: args.preserved_quota_period_id,
            store_subscription_id: args.store_subscription_id,
            store_subscription_period_id: args.store_subscription_period_id,
            updated_at_ms: args.now_ms ?? args.prepared_at_ms,
        });

        await replaceUserDeletionQueueEntry(ctx, args.user_id, nextPreparation);

        return {
            has_active_subscription: nextPreparation.has_active_subscription,
            revenuecat_app_user_id: nextPreparation.revenuecat_app_user_id,
            preserved_quota_period_id: nextPreparation.preserved_quota_period_id,
            store_subscription_id: nextPreparation.store_subscription_id,
            store_subscription_period_id: nextPreparation.store_subscription_period_id,
        };
    };

export const markUserDeletionAuthDeleted = async (ctx: MutationCtx, args: WebhookArgs.MarkUserDeletionAuthDeletedArgs) => {
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
            assertRequiredPreservedQuotaPeriod({
                user_id: args.user_id,
                has_active_subscription: nextContext.has_active_subscription,
                preserved_quota_period_id: nextContext.preserved_quota_period_id,
            });

            const nextOperation = buildUserDeletionQueueEntry({
                user_id: args.user_id,
                status: "ready_for_cleanup",
                started_at_ms: args.now_ms,
                prepared_at_ms: args.now_ms,
                auth_deleted_at_ms: args.now_ms,
                next_retry_at_ms: args.now_ms,
                retry_count: 0,
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
        const preserveCleanupLease = latestOperation.status === "cleanup_in_progress";
        assertRequiredPreservedQuotaPeriod({
            user_id: args.user_id,
            has_active_subscription: shouldRefreshContext
                ? nextContext.has_active_subscription
                : latestOperation.has_active_subscription === true,
            preserved_quota_period_id: shouldRefreshContext
                ? nextContext.preserved_quota_period_id
                : latestOperation.preserved_quota_period_id,
        });

        const nextOperation = buildUserDeletionQueueEntry({
            user_id: latestOperation.user_id,
            status: preserveCleanupLease ? "cleanup_in_progress" : "ready_for_cleanup",
            started_at_ms: latestOperation.started_at_ms,
            prepared_at_ms: latestOperation.prepared_at_ms ?? args.now_ms,
            auth_deleted_at_ms: latestOperation.auth_deleted_at_ms ?? args.now_ms,
            revenuecat_deleted_at_ms: latestOperation.revenuecat_deleted_at_ms,
            next_retry_at_ms: preserveCleanupLease
                ? latestOperation.next_retry_at_ms
                : args.now_ms,
            retry_count: latestOperation.retry_count,
            cleanup_attempt_id: preserveCleanupLease
                ? latestOperation.cleanup_attempt_id
                : undefined,
            cleanup_step: preserveCleanupLease ? latestOperation.cleanup_step : undefined,
            cleanup_step_started_at_ms: preserveCleanupLease
                ? latestOperation.cleanup_step_started_at_ms
                : undefined,
            cleanup_lease_expires_at_ms: preserveCleanupLease
                ? latestOperation.cleanup_lease_expires_at_ms
                : undefined,
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
    };

export const acquireUserDeletionOperation = async (ctx: MutationCtx, args: WebhookArgs.AcquireUserDeletionOperationArgs) => {
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
            cleanup_lease_expires_at_ms: latestOperation.cleanup_lease_expires_at_ms,
            allow_terminal_recovery: args.allow_terminal_recovery,
        })) {
            const nextRetryAtMs = getUserDeletionCleanupLeaseRetryAtMs({
                status: latestOperation.status,
                next_retry_at_ms: latestOperation.next_retry_at_ms,
                cleanup_lease_expires_at_ms: latestOperation.cleanup_lease_expires_at_ms,
            });

            return {
                acquired: false,
                missing: false,
                status: latestOperation.status,
                next_retry_at_ms: nextRetryAtMs,
            };
        }

        const nextOperation = buildUserDeletionQueueEntry({
            user_id: latestOperation.user_id,
            status: "cleanup_in_progress",
            started_at_ms: latestOperation.started_at_ms,
            prepared_at_ms: latestOperation.prepared_at_ms,
            auth_deleted_at_ms: latestOperation.auth_deleted_at_ms,
            revenuecat_deleted_at_ms: latestOperation.revenuecat_deleted_at_ms,
            next_retry_at_ms: args.lease_expires_at_ms,
            retry_count: latestOperation.retry_count,
            cleanup_attempt_id: args.cleanup_attempt_id,
            cleanup_step: args.cleanup_step ?? "acquired",
            cleanup_step_started_at_ms: args.now_ms,
            cleanup_lease_expires_at_ms: args.lease_expires_at_ms,
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
                revenuecat_deleted_at_ms: nextOperation.revenuecat_deleted_at_ms,
                next_retry_at_ms: nextOperation.next_retry_at_ms,
                retry_count: nextOperation.retry_count,
                cleanup_attempt_id: nextOperation.cleanup_attempt_id,
                cleanup_step: nextOperation.cleanup_step,
                cleanup_step_started_at_ms: nextOperation.cleanup_step_started_at_ms,
                cleanup_lease_expires_at_ms: nextOperation.cleanup_lease_expires_at_ms,
                revenuecat_app_user_id: nextOperation.revenuecat_app_user_id,
                has_active_subscription: nextOperation.has_active_subscription,
                preserved_quota_period_id: nextOperation.preserved_quota_period_id,
                store_subscription_id: nextOperation.store_subscription_id,
                store_subscription_period_id: nextOperation.store_subscription_period_id,
                updated_at_ms: nextOperation.updated_at_ms,
            },
        };
    };

export const renewUserDeletionOperationCleanupLease = async (ctx: MutationCtx, args: WebhookArgs.RenewUserDeletionOperationCleanupLeaseArgs) => {
        const latestOperation = await getLatestUserDeletionQueueEntryByUserId(ctx, args.user_id);
        const ownershipFailure = getUserDeletionCleanupOwnershipFailure({
            operation: latestOperation,
            cleanup_attempt_id: args.cleanup_attempt_id,
            now_ms: args.now_ms,
        });

        if (!latestOperation || ownershipFailure) {
            return {
                renewed: false,
                missing: ownershipFailure === "missing" || !latestOperation,
                owner_mismatch:
                    ownershipFailure === "owner_mismatch" || ownershipFailure === "not_in_progress",
                lease_expired: ownershipFailure === "lease_expired",
                ownership_failure: ownershipFailure ?? "missing",
                status: latestOperation?.status,
                next_retry_at_ms: latestOperation?.next_retry_at_ms,
                cleanup_lease_expires_at_ms: latestOperation?.cleanup_lease_expires_at_ms,
            };
        }

        const nextOperation = buildUserDeletionQueueEntry({
            user_id: latestOperation.user_id,
            status: "cleanup_in_progress",
            started_at_ms: latestOperation.started_at_ms,
            prepared_at_ms: latestOperation.prepared_at_ms,
            auth_deleted_at_ms: latestOperation.auth_deleted_at_ms,
            revenuecat_deleted_at_ms: latestOperation.revenuecat_deleted_at_ms,
            next_retry_at_ms: args.lease_expires_at_ms,
            retry_count: latestOperation.retry_count,
            last_error: latestOperation.last_error,
            cleanup_attempt_id: args.cleanup_attempt_id,
            cleanup_step: args.cleanup_step,
            cleanup_step_started_at_ms: getNextUserDeletionCleanupStepStartedAtMs({
                operation: latestOperation,
                cleanup_step: args.cleanup_step,
                now_ms: args.now_ms,
            }),
            cleanup_lease_expires_at_ms: args.lease_expires_at_ms,
            revenuecat_app_user_id: latestOperation.revenuecat_app_user_id,
            has_active_subscription: latestOperation.has_active_subscription,
            preserved_quota_period_id: latestOperation.preserved_quota_period_id,
            store_subscription_id: latestOperation.store_subscription_id,
            store_subscription_period_id: latestOperation.store_subscription_period_id,
            updated_at_ms: args.now_ms,
        });

        await replaceUserDeletionQueueEntry(ctx, args.user_id, nextOperation);

        return {
            renewed: true,
            status: nextOperation.status,
            next_retry_at_ms: nextOperation.next_retry_at_ms,
            cleanup_step: nextOperation.cleanup_step,
            cleanup_step_started_at_ms: nextOperation.cleanup_step_started_at_ms,
            cleanup_lease_expires_at_ms: nextOperation.cleanup_lease_expires_at_ms,
        };
    };

export const rescheduleUserDeletionOperation = async (ctx: MutationCtx, args: WebhookArgs.RescheduleUserDeletionOperationArgs) => {
        const latestOperation = await getLatestUserDeletionQueueEntryByUserId(ctx, args.user_id);

        if (!latestOperation) {
            return {
                updated: false,
            };
        }

        if (
            typeof args.cleanup_attempt_id !== "string" &&
            latestOperation.status === "cleanup_in_progress" &&
            typeof latestOperation.cleanup_attempt_id === "string"
        ) {
            return {
                updated: false,
                owner_mismatch: true,
                lease_expired: false,
                ownership_failure: "owner_required" as const,
                status: latestOperation.status,
                next_retry_at_ms: latestOperation.next_retry_at_ms,
                cleanup_lease_expires_at_ms: latestOperation.cleanup_lease_expires_at_ms,
            };
        }

        const ownershipFailure = getUserDeletionCleanupOwnershipFailure({
            operation: latestOperation,
            cleanup_attempt_id: args.cleanup_attempt_id,
            now_ms: args.now_ms,
        });

        if (ownershipFailure) {
            return {
                updated: false,
                owner_mismatch:
                    ownershipFailure === "owner_mismatch" || ownershipFailure === "not_in_progress",
                lease_expired: ownershipFailure === "lease_expired",
                ownership_failure: ownershipFailure,
                status: latestOperation.status,
                next_retry_at_ms: latestOperation.next_retry_at_ms,
                cleanup_lease_expires_at_ms: latestOperation.cleanup_lease_expires_at_ms,
            };
        }

        const remainsInProgress = args.status === "cleanup_in_progress";
        const cleanupStep = args.cleanup_step ?? latestOperation.cleanup_step ?? "acquired";

        const nextOperation = buildUserDeletionQueueEntry({
            user_id: latestOperation.user_id,
            status: args.status,
            started_at_ms: latestOperation.started_at_ms,
            prepared_at_ms: latestOperation.prepared_at_ms,
            auth_deleted_at_ms: args.auth_deleted_at_ms ?? latestOperation.auth_deleted_at_ms,
            revenuecat_deleted_at_ms:
                args.revenuecat_deleted_at_ms ?? latestOperation.revenuecat_deleted_at_ms,
            next_retry_at_ms: args.next_retry_at_ms,
            retry_count: latestOperation.retry_count + Math.max(0, args.retry_count_increment ?? 0),
            last_error:
                args.last_error === null
                    ? undefined
                    : (args.last_error ?? latestOperation.last_error),
            cleanup_attempt_id: remainsInProgress
                ? args.cleanup_attempt_id ?? latestOperation.cleanup_attempt_id
                : undefined,
            cleanup_step: remainsInProgress ? cleanupStep : undefined,
            cleanup_step_started_at_ms: remainsInProgress
                ? getNextUserDeletionCleanupStepStartedAtMs({
                      operation: latestOperation,
                      cleanup_step: cleanupStep,
                      now_ms: args.now_ms,
                  })
                : undefined,
            cleanup_lease_expires_at_ms: remainsInProgress
                ? args.cleanup_lease_expires_at_ms ?? args.next_retry_at_ms
                : undefined,
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
    };

export const deleteUserSubscriptionData = async (ctx: MutationCtx, args: WebhookArgs.DeleteUserSubscriptionDataArgs) => {
        const [latestOperation, latestState, preservedQuotaPeriod] = await Promise.all([
            getLatestUserDeletionQueueEntryByUserId(ctx, args.user_id),
            getLatestSubscriptionStateByUserId(ctx, args.user_id),
            args.preserved_quota_period_id
                ? ctx.db.get("quota_periods", args.preserved_quota_period_id)
                : null,
        ]);
        const deletionRequiresPreservedQuotaPeriod =
            latestOperation?.has_active_subscription === true ||
            latestState?.has_active_subscription === true;

        assertPreservedQuotaPeriodBelongsToDeletionUser({
            user_id: args.user_id,
            has_active_subscription: deletionRequiresPreservedQuotaPeriod,
            preserved_quota_period_id: args.preserved_quota_period_id,
            preservedQuotaPeriod,
        });

        let remainingDeletes = USER_DELETION_BATCH_LIMIT;
        const usageEventDeletion = await deleteUsageEventsByUserIdBatch(
            ctx,
            args.user_id,
            remainingDeletes
        );
        remainingDeletes -= usageEventDeletion.deleted_count;

        let deletedRevenueCatEvents = 0;
        let hasMoreRevenueCatEvents = false;

        if (remainingDeletes > 0) {
            const activeRevenueCatEventProcessing =
                await getActiveRevenueCatEventProcessingForUserDeletionSnapshot(ctx, {
                    user_id: args.user_id,
                    now_ms: args.now_ms,
                    limit: 1,
                });

            if (activeRevenueCatEventProcessing.active_processing_count > 0) {
                throw new Error(
                    "Cannot delete RevenueCat event data while webhook processing is active for the deleted user"
                );
            }

            const revenueCatEventsToDelete = await listRevenueCatEventsForUserDeletionBatch(ctx, {
                user_id: args.user_id,
                revenuecat_app_user_id: args.revenuecat_app_user_id,
                limit: remainingDeletes + 1,
            });
            const revenueCatEventBatch = revenueCatEventsToDelete.slice(0, remainingDeletes);
            hasMoreRevenueCatEvents = revenueCatEventsToDelete.length > revenueCatEventBatch.length;

            for (const eventDoc of revenueCatEventBatch) {
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
        let hasMoreQuotaPeriods = false;

        if (remainingDeletes > 0) {
            const quotaPeriodDeletion = await prepareQuotaPeriodsForUserDeletionBatch(ctx, {
                user_id: args.user_id,
                preserved_quota_period_id: args.preserved_quota_period_id,
                delete_limit: remainingDeletes,
            });
            hasMoreQuotaPeriods = quotaPeriodDeletion.has_more;

            for (const quotaPeriod of quotaPeriodDeletion.quota_periods) {
                await deleteQuotaPeriodCountersByQuotaPeriodId(ctx, quotaPeriod._id);
                await ctx.db.delete("quota_periods", quotaPeriod._id);
                deletedQuotaPeriods += 1;
            }
        }

        return {
            preserved_quota_period_id: args.preserved_quota_period_id ?? null,
            deleted_quota_periods: deletedQuotaPeriods,
            deleted_usage_events: usageEventDeletion.deleted_count,
            deleted_revenue_cat_events: deletedRevenueCatEvents,
            has_remaining: doesUserDeletionSubscriptionCleanupHaveRemaining({
                remaining_delete_budget: remainingDeletes,
                usage_event_has_more: usageEventDeletion.has_more,
                revenuecat_event_has_more: hasMoreRevenueCatEvents,
                quota_period_has_more: hasMoreQuotaPeriods,
            }),
        };
    };

export const finalizeDeletedUserSubscriptionData = async (ctx: MutationCtx, args: WebhookArgs.FinalizeDeletedUserSubscriptionDataArgs) => {
        assertRequiredPreservedQuotaPeriod({
            user_id: args.user_id,
            has_active_subscription: args.has_active_subscription,
            preserved_quota_period_id: args.preserved_quota_period_id,
        });

        const preservedQuotaPeriod = args.preserved_quota_period_id
            ? await ctx.db.get("quota_periods", args.preserved_quota_period_id)
            : null;

        assertPreservedQuotaPeriodBelongsToDeletionUser({
            user_id: args.user_id,
            has_active_subscription: args.has_active_subscription,
            preserved_quota_period_id: args.preserved_quota_period_id,
            preservedQuotaPeriod,
        });

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

        if (args.has_active_subscription && preservedQuotaPeriod) {
            const wasAlreadyRestored = typeof preservedQuotaPeriod.restored_at_ms === "number";

            await ctx.db.patch("quota_periods", preservedQuotaPeriod._id, {
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
                frozen_at_ms: preservedQuotaPeriod.frozen_at_ms ?? args.now_ms,
                closed_at_ms: preservedQuotaPeriod.closed_at_ms ?? args.now_ms,
                updated_at_ms: args.now_ms,
            });

            frozenQuotaPeriodId = preservedQuotaPeriod._id;

            if (!wasAlreadyRestored) {
                const restorationTarget = await getQuotaPeriodRestorationTargetForDeletedUser(ctx, {
                    deleted_user_id: args.user_id,
                    frozen_quota_period_id: preservedQuotaPeriod._id,
                    store_subscription_period_id:
                        args.store_subscription_period_id ?? preservedQuotaPeriod.store_subscription_period_id,
                    store_subscription_id:
                        args.store_subscription_id ?? preservedQuotaPeriod.store_subscription_id,
                    store: preservedQuotaPeriod.store,
                    period_start_at_ms: preservedQuotaPeriod.period_start_at_ms,
                    period_end_at_ms: preservedQuotaPeriod.period_end_at_ms,
                });

                if (restorationTarget) {
                    await mergeQuotaPeriodCountersIntoTarget(ctx, {
                        source_quota_period_id: preservedQuotaPeriod._id,
                        target_quota_period_id: restorationTarget._id,
                        now_ms: args.now_ms,
                    });
                    await ctx.db.patch("quota_periods", preservedQuotaPeriod._id, {
                        restored_at_ms: args.now_ms,
                        restored_to_quota_period_id: restorationTarget._id,
                        updated_at_ms: args.now_ms,
                    });
                }
            }
        }

        for (const stateDoc of stateDocs) {
            await ctx.db.delete("subscription_states", stateDoc._id);
        }

        return {
            frozen_quota_period_id: frozenQuotaPeriodId,
            deleted_subscription_states: stateDocs.length,
        };
    };

export const deferSubscriptionStateReconciliation = async (ctx: MutationCtx, args: WebhookArgs.DeferSubscriptionStateReconciliationArgs) => {
        const existingState = await getLatestSubscriptionStateByUserId(ctx, args.user_id);

        if (!existingState) {
            return {
                status: "missing",
            };
        }

        await ctx.db.patch("subscription_states", existingState._id, {
            stale_after_at_ms: args.next_attempt_at_ms,
            updated_at_ms: args.next_attempt_at_ms,
        } as Record<string, unknown>);

        return {
            status: "deferred",
        };
    };
