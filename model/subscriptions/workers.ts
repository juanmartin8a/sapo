import { components, internal } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import type * as WorkerArgs from "../../validators/subscriptionsWorkers";
import { FAR_FUTURE_TIMESTAMP_MS } from "../../constants/time";
import {
    PENDING_ACTIVE_SIGNAL_TTL_MS,
    SUBSCRIPTION_ACTIVATION_RETRY_DELAYS_MS,
    type SubscriptionPlanKey,
} from "../../constants/subscriptions";
import {
    REVENUECAT_TERMINAL_WEBHOOK_EVENT_STATUSES,
    type RevenueCatWebhookEventStatus,
} from "../../constants/revenueCat";
import {
    USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS,
    USER_DELETION_CLEANUP_DEAD_LETTER_STATUS,
    USER_DELETION_LATE_AUTH_WAIT_STATUS,
    type UserDeletionCleanupStep,
    type UserDeletionQueueContext,
    assertRequiredPreservedQuotaPeriod,
    getMissingPreservedQuotaPeriodErrorMessage,
    hasRequiredPreservedQuotaPeriod,
    resolveAuthDeletedUserDeletionContext,
    resolvePreparedUserDeletionContext,
    resolveUserDeletionAuthDeleteWaitStatus,
    resolveUserDeletionQuiescenceStatus,
    shouldDeleteOverdueActiveUsageEvents,
} from "./userDeletionQueue";

import {
    getFrozenQuotaPeriodRetentionMs,
    getReconciliationBatchLimit,
    getReconciliationFailureBackoffMs,
    getRevenueCatEventsRetentionMs,
    getRetryBatchLimit,
    getSubscriptionProcessingConfig,
    getWebhookRetryConfig,
} from "./config";
import {
    deleteRevenueCatSubscriber,
    fetchRevenueCatSubscriberSnapshot,
    formatErrorMessage,
    getMissingRevenueCatReadApiV2ConfigMessage,
    getRevenueCatApiErrorRetryDelayMs,
    getRevenueCatEventsRetentionCutoffMs,
    isRevenueCatApiErrorWithStatus,
    shouldUseExistingSubscriptionState,
    type CurrentSubscriptionState,
} from "./revenueCatApi";
import {
    acquireRevenueCatEventProcessingLeases,
    acquireUserDeletionOperationByUserId,
    beginSubscriptionStateReconciliation,
    claimPendingActiveRetry,
    clearUserDeletionOperationByUserId,
    getActiveUserDeletionUsageEventCountByUserId,
    getActiveRevenueCatEventProcessingForUserDeletionByUserId,
    getBetterAuthUserCreatedAtMs,
    getSubscriptionStateByUserId,
    getUserDeletionOperationStateByUserId,
    getUserDeletionSnapshotByUserId,
    listAuthDeleteDeadLetterUserDeletionOperationUserIds,
    listCleanupDeadLetterUserDeletionOperationUserIds,
    listDueUserDeletionOperationUserIds,
    listPendingActiveRetriesDue,
    markUserDeletionAuthDeletedByUserId,
    recordRevenueCatEventProcessingProgress,
    releaseSubscriptionStateReconciliation,
    renewUserDeletionOperationCleanupLeaseByUserId,
    rescheduleUserDeletionOperationByUserId,
    startUserDeletionOperationByUserId,
    type RevenueCatEventProgressMutationResult,
    type RevenueCatWebhookEventForProcessing,
    type SubscriptionStateReconciliationCtx,
    type UserDeletionOperationState,
    type UserDeletionSnapshot,
} from "./componentApi";

const RETENTION_PURGE_BATCH_LIMIT_PER_STATUS = 500;
const FROZEN_QUOTA_PERIOD_PURGE_BATCH_LIMIT = 500;
const FROZEN_QUOTA_PERIOD_PURGE_MAX_BATCHES = 10;
const USER_DELETION_AUTH_DELETE_CONFIRM_TIMEOUT_MS = 60_000;
const USER_DELETION_AUTH_DELETE_DEAD_LETTER_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const USER_DELETION_CLEANUP_LEASE_MS = 2 * 60 * 1000;
const USER_DELETION_CLEANUP_RETRY_DELAY_MS = 15_000;
const USER_DELETION_CLEANUP_FAST_RETRY_LIMIT = 3;
const USER_DELETION_CLEANUP_DEAD_LETTER_RETRY_LIMIT = 12;
const USER_DELETION_CLEANUP_CRON_RETRY_DELAY_MS = 15 * 60 * 1000;
const USER_DELETION_CLEANUP_DEAD_LETTER_RECOVERY_DELAY_MS = 24 * 60 * 60 * 1000;
const USER_DELETION_QUIESCENCE_GRACE_MS = 3 * 60 * 1000;
const USER_DELETION_SUBSCRIPTION_CLEANUP_MAX_BATCHES = 10;
const USER_DELETION_TERMINAL_NEXT_RETRY_AT_MS = FAR_FUTURE_TIMESTAMP_MS;
const REVENUECAT_EVENT_PROCESSING_LEASE_MS = 90_000;
const SUBSCRIPTION_STATE_RECONCILIATION_LEASE_MS = 90_000;
type SubscriptionStateRefreshResult =
    | {
          status: "already_fresh" | "created" | "updated" | "unchanged";
          revenuecat_app_user_id: string;
           plan_key: SubscriptionPlanKey;
          has_active_subscription: boolean;
          last_synced_at_ms: number;
          billing_cycle_end_at_ms?: number;
      }
    | {
          status: "pending_active";
          revenuecat_app_user_id: string;
           plan_key: SubscriptionPlanKey;
          has_active_subscription: boolean;
          last_synced_at_ms: number;
          billing_cycle_end_at_ms?: number;
          pending_active_expires_at_ms?: number;
          pending_active_signal_at_ms?: number;
      }
    | {
          status: "sync_in_progress";
          revenuecat_app_user_id: string;
           plan_key: SubscriptionPlanKey;
          has_active_subscription: boolean;
          last_synced_at_ms: number;
          billing_cycle_end_at_ms?: number;
          retry_at_ms?: number;
      }
    | {
          status: "user_missing";
          revenuecat_app_user_id: string;
      }
    | {
          status: "deletion_in_progress";
          revenuecat_app_user_id: string;
      }
    | {
          status: "refresh_failed";
          revenuecat_app_user_id: string;
          error: string;
          should_block_requests: boolean;
           plan_key?: SubscriptionPlanKey;
          has_active_subscription?: boolean;
          last_synced_at_ms?: number;
          billing_cycle_end_at_ms?: number;
      }
    | {
          status: "rate_limited";
          revenuecat_app_user_id: string;
          plan_key: SubscriptionPlanKey;
          has_active_subscription: boolean;
          last_synced_at_ms: number;
          billing_cycle_end_at_ms?: number;
          retry_at_ms: number;
      };

type RevenueCatWebhookProcessingStatus =
    | "missing"
    | Exclude<RevenueCatWebhookEventStatus, "pending">
    | "deferred";

function mapProgressMutationStatusToProcessingStatus(
    status: RevenueCatEventProgressMutationResult["status"]
): RevenueCatWebhookProcessingStatus {
    if (status === "pending") {
        return "deferred";
    }

    return status;
}

function mapRevenueCatProgressMutationResultToProcessingStatus(
    result: RevenueCatEventProgressMutationResult
): RevenueCatWebhookProcessingStatus {
    if (result.owner_mismatch || result.lease_expired || result.ownership_failure) {
        return "deferred";
    }

    return mapProgressMutationStatusToProcessingStatus(result.status);
}

function createRevenueCatEventProcessingAttemptId(eventDocId: string) {
    const randomSuffix = Math.random().toString(36).slice(2);

    return `${eventDocId}:${Date.now().toString(36)}:${randomSuffix}`;
}

function createSubscriptionReconciliationAttemptId(userId: string) {
    const randomSuffix = Math.random().toString(36).slice(2);

    return `${userId}:${Date.now().toString(36)}:${randomSuffix}`;
}

async function schedulePendingSubscriptionActivationRetry(
    ctx: Pick<ActionCtx, "scheduler">,
    args: {
        user_id: string;
        active_signal_at_ms: number;
        retry_index: number;
        event_doc_id?: string;
    }
) {
    const delayMs = SUBSCRIPTION_ACTIVATION_RETRY_DELAYS_MS[args.retry_index];
    if (typeof delayMs !== "number") {
        return;
    }

    await ctx.scheduler.runAfter(
        delayMs,
        internal.subscriptionsWorkers.retryPendingSubscriptionActivation,
        args
    );
}

function isRevenueCatWebhookActiveSignal(eventType: string) {
    return new Set([
        "INITIAL_PURCHASE",
        "NON_RENEWING_PURCHASE",
        "PRODUCT_CHANGE",
        "RENEWAL",
        "SUBSCRIPTION_EXTENDED",
        "TEMPORARY_ENTITLEMENT_GRANT",
        "UNCANCELLATION",
    ]).has(eventType);
}

function hasAppliedRevenueCatWebhookEvent(
    state: Pick<
        CurrentSubscriptionState,
        "last_revenuecat_event_id" | "last_revenuecat_event_at_ms"
    > | null | undefined,
    args: {
        event_id: string;
        event_at_ms: number;
    }
) {
    if (!state) {
        return false;
    }

    if (state.last_revenuecat_event_id === args.event_id) {
        return true;
    }

    return (
        typeof state.last_revenuecat_event_at_ms === "number" &&
        Number.isFinite(state.last_revenuecat_event_at_ms) &&
        state.last_revenuecat_event_at_ms > args.event_at_ms
    );
}

function hasPendingActiveSignal(
    state: Pick<CurrentSubscriptionState, "pending_active_expires_at_ms"> | null | undefined,
    nowMs: number
) {
    return (
        typeof state?.pending_active_expires_at_ms === "number" &&
        state.pending_active_expires_at_ms > nowMs
    );
}

export function shouldUseExistingStateForObservedSubscription(
    state: CurrentSubscriptionState | null,
    nowMs: number,
    observedActive?: boolean
) {
    return Boolean(
        state &&
        !hasPendingActiveSignal(state, nowMs) &&
        (typeof observedActive !== "boolean" ||
            state.has_active_subscription === observedActive) &&
        shouldUseExistingSubscriptionState(state, nowMs)
    );
}

function resolveStoreSubscriptionIdHintFromRevenueCatEvent(
    eventDoc: Pick<RevenueCatWebhookEventForProcessing, "event_type" | "transaction_id">
) {
    if (eventDoc.event_type === "TEMPORARY_ENTITLEMENT_GRANT") {
        return undefined;
    }

    return eventDoc.transaction_id;
}

function resolveUserDeletionContextFromState(
    state: UserDeletionOperationState
): UserDeletionQueueContext | null {
    if (!state.in_progress || typeof state.has_active_subscription !== "boolean") {
        return null;
    }

    return {
        has_active_subscription: state.has_active_subscription,
        revenuecat_app_user_id: state.revenuecat_app_user_id,
        preserved_quota_period_id: state.preserved_quota_period_id,
        store_subscription_id: state.store_subscription_id,
        store_subscription_period_id: state.store_subscription_period_id,
    };
}

async function getUserDeletionQuiescenceSnapshotByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string,
    nowMs: number
) {
    const [usageEventCountResult, revenueCatEventProcessingResult] = await Promise.all([
        getActiveUserDeletionUsageEventCountByUserId(ctx, userId),
        getActiveRevenueCatEventProcessingForUserDeletionByUserId(ctx, userId, nowMs, 1),
    ]);

    return {
        active_usage_event_count: usageEventCountResult.active_usage_event_count,
        active_revenuecat_event_processing_count:
            revenueCatEventProcessingResult.active_processing_count,
        revenuecat_event_processing_expires_at_ms:
            revenueCatEventProcessingResult.processing_expires_at_ms,
    };
}

function getUserDeletionQuiescenceRetryAtMs(args: {
    snapshot: Awaited<ReturnType<typeof getUserDeletionQuiescenceSnapshotByUserId>>;
    now_ms: number;
}) {
    const retryCandidates = [args.now_ms + USER_DELETION_CLEANUP_RETRY_DELAY_MS];

    if (typeof args.snapshot.revenuecat_event_processing_expires_at_ms === "number") {
        retryCandidates.push(args.snapshot.revenuecat_event_processing_expires_at_ms);
    }

    return Math.max(args.now_ms, Math.min(...retryCandidates));
}

async function scheduleQueuedUserDeletionProcessing(
    ctx: Pick<ActionCtx, "scheduler">,
    userId: string,
    delayMs: number,
    cleanupFastRetryAttempt?: number
) {
    await ctx.scheduler.runAfter(delayMs, internal.subscriptionsWorkers.finalizeDeletedUserData, {
        user_id: userId,
        ...(typeof cleanupFastRetryAttempt === "number"
            ? { cleanup_fast_retry_attempt: cleanupFastRetryAttempt }
            : {}),
    });
}

function getNextUserDeletionCleanupFastRetryAttempt(currentAttempt?: number) {
    const nextAttempt = Math.max(0, currentAttempt ?? 0) + 1;

    return nextAttempt <= USER_DELETION_CLEANUP_FAST_RETRY_LIMIT ? nextAttempt : null;
}

function getUserDeletionCleanupRetryPlan(
    nowMs: number,
    currentFastRetryAttempt?: number,
    minimumRetryDelayMs?: number
) {
    const nextFastRetryAttempt = getNextUserDeletionCleanupFastRetryAttempt(currentFastRetryAttempt);
    const minimumDelayMs = Math.max(0, Math.floor(minimumRetryDelayMs ?? 0));

    if (nextFastRetryAttempt !== null) {
        const retryDelayMs = Math.max(USER_DELETION_CLEANUP_RETRY_DELAY_MS, minimumDelayMs);

        return {
            next_retry_at_ms: nowMs + retryDelayMs,
            schedule_delay_ms: retryDelayMs,
            cleanup_fast_retry_attempt: nextFastRetryAttempt,
        };
    }

    const retryDelayMs = Math.max(USER_DELETION_CLEANUP_CRON_RETRY_DELAY_MS, minimumDelayMs);

    return {
        next_retry_at_ms: nowMs + retryDelayMs,
    };
}

function isPermanentUserDeletionCleanupError(errorMessage: string, error?: unknown) {
    if (isRevenueCatApiErrorWithStatus(error, [400, 401, 403, 422])) {
        return true;
    }

    return (
        errorMessage.includes("Missing RevenueCat customer delete configuration") ||
        errorMessage.includes("Missing RevenueCat v2 project id") ||
        errorMessage.includes("Missing RevenueCat customer delete") ||
        errorMessage.includes("RevenueCat subscriber delete failed with status 401") ||
        errorMessage.includes("RevenueCat subscriber delete failed with status 403") ||
        errorMessage.includes("Cannot continue paid-user deletion") ||
        errorMessage.includes("Missing saved deletion context")
    );
}

function shouldDeadLetterUserDeletionCleanup(args: {
    error_message: string;
    error?: unknown;
    retry_count: number;
}) {
    return (
        isPermanentUserDeletionCleanupError(args.error_message, args.error) ||
        args.retry_count >= USER_DELETION_CLEANUP_DEAD_LETTER_RETRY_LIMIT
    );
}

async function recordOperationalAlert(
    ctx: Pick<ActionCtx, "runAction">,
    args: {
        kind: string;
        entity_key: string;
        severity: "warning" | "error" | "critical";
        title: string;
        message: string;
        last_error?: string;
    }
) {
    await (ctx as any)
        .runAction((internal as any).operationalAlerts.recordOperationalAlertAndNotify, args)
        .catch((error: unknown) => {
            console.warn("Failed to record operational alert:", error);
        });
}

function createUserDeletionCleanupAttemptId(userId: string) {
    const randomSuffix = Math.random().toString(36).slice(2);

    return `${userId}:${Date.now().toString(36)}:${randomSuffix}`;
}

function getUserDeletionCleanupLeaseLostResult(args: {
    step: UserDeletionCleanupStep;
    ownership_failure?: string;
    next_retry_at_ms?: number;
    cleanup_lease_expires_at_ms?: number;
}) {
    return {
        status: "lease_lost" as const,
        cleanup_step: args.step,
        ownership_failure: args.ownership_failure,
        next_retry_at_ms: args.next_retry_at_ms,
        cleanup_lease_expires_at_ms: args.cleanup_lease_expires_at_ms,
    };
}

async function renewUserDeletionCleanupLease(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string,
    cleanupAttemptId: string,
    step: UserDeletionCleanupStep
) {
    const nowMs = Date.now();
    const renewal = await renewUserDeletionOperationCleanupLeaseByUserId(ctx, userId, {
        cleanup_attempt_id: cleanupAttemptId,
        cleanup_step: step,
        now_ms: nowMs,
        lease_expires_at_ms: nowMs + USER_DELETION_CLEANUP_LEASE_MS,
    });

    if (renewal.renewed) {
        return null;
    }

    return getUserDeletionCleanupLeaseLostResult({
        step,
        ownership_failure: renewal.ownership_failure,
        next_retry_at_ms: renewal.next_retry_at_ms,
        cleanup_lease_expires_at_ms: renewal.cleanup_lease_expires_at_ms,
    });
}

async function rescheduleOwnedUserDeletionOperation(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string,
    cleanupAttemptId: string,
    args: Omit<
        Parameters<typeof rescheduleUserDeletionOperationByUserId>[2],
        "cleanup_attempt_id"
    >,
    step: UserDeletionCleanupStep
) {
    const result = await rescheduleUserDeletionOperationByUserId(ctx, userId, {
        ...args,
        cleanup_attempt_id: cleanupAttemptId,
    });

    if (result.updated) {
        return null;
    }

    if (result.owner_mismatch || result.lease_expired || result.ownership_failure) {
        return getUserDeletionCleanupLeaseLostResult({
            step,
            ownership_failure: result.ownership_failure,
            next_retry_at_ms: result.next_retry_at_ms,
        });
    }

    return null;
}

async function handleOwnedUserDeletionCleanupFailure(
    ctx: ActionCtx,
    args: {
        user_id: string;
        cleanup_attempt_id: string;
        cleanup_step: UserDeletionCleanupStep;
        current_retry_count?: number;
        cleanup_fast_retry_attempt?: number;
        error_message: string;
        error?: unknown;
        minimum_retry_delay_ms?: number;
        auth_deleted_at_ms?: number;
        retry_status?: "waiting_for_quiescence";
    }
) {
    const nowMs = Date.now();
    const retryPlan = getUserDeletionCleanupRetryPlan(
        nowMs,
        args.cleanup_fast_retry_attempt,
        args.minimum_retry_delay_ms
    );
    const nextRetryCount = (args.current_retry_count ?? 0) + 1;
    const shouldDeadLetter = shouldDeadLetterUserDeletionCleanup({
        error_message: args.error_message,
        error: args.error,
        retry_count: nextRetryCount,
    });
    const nextStatus = shouldDeadLetter
        ? USER_DELETION_CLEANUP_DEAD_LETTER_STATUS
        : (args.retry_status ?? "retryable_error");
    const nextRetryAtMs = shouldDeadLetter
        ? nowMs + USER_DELETION_CLEANUP_DEAD_LETTER_RECOVERY_DELAY_MS
        : retryPlan.next_retry_at_ms;
    const leaseLost = await rescheduleOwnedUserDeletionOperation(
        ctx,
        args.user_id,
        args.cleanup_attempt_id,
        {
            status: nextStatus,
            now_ms: nowMs,
            next_retry_at_ms: nextRetryAtMs,
            retry_count_increment: 1,
            last_error: args.error_message,
            ...(typeof args.auth_deleted_at_ms === "number"
                ? { auth_deleted_at_ms: args.auth_deleted_at_ms }
                : {}),
        },
        args.cleanup_step
    ).catch(() => null);

    if (leaseLost) {
        return leaseLost;
    }

    if (shouldDeadLetter) {
        console.error(
            JSON.stringify({
                event: "user_deletion_cleanup_dead_lettered",
                user_id: args.user_id,
                cleanup_step: args.cleanup_step,
                retry_count: nextRetryCount,
                error: args.error_message,
            })
        );
        await recordOperationalAlert(ctx, {
            kind: "user_deletion_cleanup_dead_letter",
            entity_key: args.user_id,
            severity: "critical",
            title: "User deletion cleanup dead-lettered",
            message:
                "Account deletion cleanup reached a terminal failure. Manual recovery is required before automatic retries resume.",
            last_error: args.error_message,
        });
    } else if (typeof retryPlan.cleanup_fast_retry_attempt === "number") {
        try {
            await scheduleQueuedUserDeletionProcessing(
                ctx,
                args.user_id,
                retryPlan.schedule_delay_ms,
                retryPlan.cleanup_fast_retry_attempt
            );
        } catch {
            // Cron is the fallback.
        }
    }

    return {
        status: nextStatus,
        error: args.error_message,
        next_retry_at_ms: nextRetryAtMs,
    };
}


async function reconcileSubscriptionStateFromRevenueCat(
    ctx: SubscriptionStateReconciliationCtx,
    args: {
        user_id: string;
        force: boolean;
        now_ms: number;
        store_subscription_id_hint?: string;
        expects_active_subscription?: boolean;
        trusted_active_signal?: boolean;
        active_signal_at_ms?: number;
        revenuecat_event_id?: string;
        revenuecat_event_at_ms?: number;
        allow_user_deletion_in_progress?: boolean;
        client_observed_active?: boolean;
        use_confirmed_state_while_activation_pending?: boolean;
        clear_pending_active_signal?: boolean;
    }
): Promise<SubscriptionStateRefreshResult> {
    const existingState = await getSubscriptionStateByUserId(ctx, args.user_id);
    const revenueCatAppUserId = existingState?.revenuecat_app_user_id ?? args.user_id;
    let snapshotHasActiveSubscription = false;
    let syncAttemptId: string | null = null;

    if (
        existingState &&
        typeof args.revenuecat_event_id === "string" &&
        typeof args.revenuecat_event_at_ms === "number" &&
        hasAppliedRevenueCatWebhookEvent(existingState, {
            event_id: args.revenuecat_event_id,
            event_at_ms: args.revenuecat_event_at_ms,
        })
    ) {
        return {
            status: "already_fresh",
            revenuecat_app_user_id: revenueCatAppUserId,
            plan_key: existingState.plan_key,
            has_active_subscription: existingState.has_active_subscription,
            last_synced_at_ms: existingState.last_synced_at_ms,
            ...(typeof existingState.billing_cycle_end_at_ms === "number"
                ? { billing_cycle_end_at_ms: existingState.billing_cycle_end_at_ms }
                : {}),
        };
    }

    if (args.allow_user_deletion_in_progress !== true) {
        const deletionOperationState = await getUserDeletionOperationStateByUserId(ctx, args.user_id);

        if (deletionOperationState.blocks_revenuecat_reconciliation) {
            return {
                status: "deletion_in_progress",
                revenuecat_app_user_id: revenueCatAppUserId,
            };
        }
    }

    if (
        args.client_observed_active === true &&
        existingState &&
        existingState.has_active_subscription !== true &&
        hasPendingActiveSignal(existingState, args.now_ms)
    ) {
        return {
            status: "pending_active",
            revenuecat_app_user_id: revenueCatAppUserId,
            plan_key: existingState.plan_key,
            has_active_subscription: existingState.has_active_subscription,
            last_synced_at_ms: existingState.last_synced_at_ms,
            pending_active_expires_at_ms: existingState.pending_active_expires_at_ms,
            ...(typeof existingState.billing_cycle_end_at_ms === "number"
                ? { billing_cycle_end_at_ms: existingState.billing_cycle_end_at_ms }
                : {}),
        };
    }

    if (
        args.use_confirmed_state_while_activation_pending === true &&
        existingState &&
        hasPendingActiveSignal(existingState, args.now_ms)
    ) {
        return {
            status: "already_fresh",
            revenuecat_app_user_id: revenueCatAppUserId,
            plan_key: existingState.plan_key,
            has_active_subscription: existingState.has_active_subscription,
            last_synced_at_ms: existingState.last_synced_at_ms,
            ...(typeof existingState.billing_cycle_end_at_ms === "number"
                ? { billing_cycle_end_at_ms: existingState.billing_cycle_end_at_ms }
                : {}),
        };
    }

    if (
        !args.force &&
        existingState &&
        shouldUseExistingStateForObservedSubscription(
            existingState,
            args.now_ms,
            args.client_observed_active
        )
    ) {
        return {
            status: "already_fresh",
            revenuecat_app_user_id: revenueCatAppUserId,
            plan_key: existingState.plan_key,
            has_active_subscription: existingState.has_active_subscription,
            last_synced_at_ms: existingState.last_synced_at_ms,
            ...(typeof existingState.billing_cycle_end_at_ms === "number"
                ? { billing_cycle_end_at_ms: existingState.billing_cycle_end_at_ms }
                : {}),
        };
    }

    try {
        const processingConfig = getSubscriptionProcessingConfig();
        const betterAuthUser = await getBetterAuthUserCreatedAtMs(ctx, args.user_id);

        if (!betterAuthUser.exists) {
            return {
                status: "user_missing",
                revenuecat_app_user_id: revenueCatAppUserId,
            };
        }

        syncAttemptId = createSubscriptionReconciliationAttemptId(args.user_id);
        const leaseNowMs = Date.now();
        const leaseResult = await beginSubscriptionStateReconciliation(ctx, {
            user_id: args.user_id,
            revenuecat_app_user_id: revenueCatAppUserId,
            ...(typeof betterAuthUser.created_at_ms === "number"
                ? { signup_at_ms: betterAuthUser.created_at_ms }
                : {}),
            sync_attempt_id: syncAttemptId,
            now_ms: leaseNowMs,
            lease_duration_ms: SUBSCRIPTION_STATE_RECONCILIATION_LEASE_MS,
            ...(args.expects_active_subscription === true
                ? { expects_active_subscription: true }
                : {}),
            ...(args.trusted_active_signal === true
                ? { trusted_active_signal: true }
                : {}),
            ...(typeof args.active_signal_at_ms === "number"
                ? { active_signal_at_ms: args.active_signal_at_ms }
                : {}),
            active_signal_ttl_ms: PENDING_ACTIVE_SIGNAL_TTL_MS,
            ...(typeof args.client_observed_active === "boolean"
                ? { client_reconciliation: true }
                : {}),
            ...(args.clear_pending_active_signal === true
                ? { clear_pending_active_signal: true }
                : {}),
            ...(typeof args.revenuecat_event_at_ms === "number"
                ? { revenuecat_event_at_ms: args.revenuecat_event_at_ms }
                : {}),
        });

        if (leaseResult.status === "in_progress") {
            return {
                status: "sync_in_progress",
                revenuecat_app_user_id: leaseResult.revenuecat_app_user_id,
                plan_key: leaseResult.plan_key,
                has_active_subscription: leaseResult.has_active_subscription,
                last_synced_at_ms: leaseResult.last_synced_at_ms,
                retry_at_ms: leaseResult.retry_at_ms,
                ...(typeof leaseResult.billing_cycle_end_at_ms === "number"
                    ? { billing_cycle_end_at_ms: leaseResult.billing_cycle_end_at_ms }
                : {}),
            };
        }

        if (leaseResult.status === "rate_limited") {
            return {
                status: "rate_limited",
                revenuecat_app_user_id: leaseResult.revenuecat_app_user_id,
                plan_key: leaseResult.plan_key,
                has_active_subscription: leaseResult.has_active_subscription,
                last_synced_at_ms: leaseResult.last_synced_at_ms,
                retry_at_ms: leaseResult.retry_at_ms,
                ...(typeof leaseResult.billing_cycle_end_at_ms === "number"
                    ? { billing_cycle_end_at_ms: leaseResult.billing_cycle_end_at_ms }
                    : {}),
            };
        }

        const snapshotAtMs = Date.now();
        const snapshot = await fetchRevenueCatSubscriberSnapshot(revenueCatAppUserId, snapshotAtMs);
        const applyAtMs = Date.now();
        snapshotHasActiveSubscription = snapshot.has_active_subscription;
        const applyResult: {
            status: "created" | "updated" | "unchanged" | "pending_active";
            plan_key: SubscriptionPlanKey;
            has_active_subscription: boolean;
            last_synced_at_ms: number;
            billing_cycle_end_at_ms?: number;
            pending_active_expires_at_ms?: number;
            pending_active_signal_at_ms?: number;
            owner_mismatch?: boolean;
            lease_expired?: boolean;
            superseded?: boolean;
            ownership_failure?: string;
        } = await (ctx as any).runMutation(
            components.subscriptions.webhook.applyReconciledSubscriptionState,
            {
                user_id: args.user_id,
                revenuecat_app_user_id: revenueCatAppUserId,
                ...(typeof betterAuthUser.created_at_ms === "number"
                    ? { signup_at_ms: betterAuthUser.created_at_ms }
                    : {}),
                synced_at_ms: applyAtMs,
                sync_attempt_id: syncAttemptId,
                expiration_reconciliation_delay_ms:
                    processingConfig.expiration_reconciliation_delay_ms,
                ...(args.store_subscription_id_hint
                    ? { store_subscription_id_hint: args.store_subscription_id_hint }
                    : {}),
                ...(args.allow_user_deletion_in_progress === true
                    ? { allow_user_deletion_in_progress: true }
                    : {}),
                ...(args.expects_active_subscription === true
                    ? { expects_active_subscription: true }
                    : {}),
                ...(args.trusted_active_signal === true
                    ? { trusted_active_signal: true }
                    : {}),
                ...(typeof args.active_signal_at_ms === "number"
                    ? { active_signal_at_ms: args.active_signal_at_ms }
                    : {}),
                active_signal_ttl_ms: PENDING_ACTIVE_SIGNAL_TTL_MS,
                ...(args.clear_pending_active_signal === true
                    ? { clear_pending_active_signal: true }
                    : {}),
                ...(typeof args.revenuecat_event_id === "string"
                    ? { revenuecat_event_id: args.revenuecat_event_id }
                    : {}),
                ...(typeof args.revenuecat_event_at_ms === "number"
                    ? { revenuecat_event_at_ms: args.revenuecat_event_at_ms }
                    : {}),
                snapshot,
            }
        );

        if (applyResult.owner_mismatch || applyResult.lease_expired) {
            return {
                status: "sync_in_progress",
                revenuecat_app_user_id: revenueCatAppUserId,
                plan_key: applyResult.plan_key,
                has_active_subscription: applyResult.has_active_subscription,
                last_synced_at_ms: applyResult.last_synced_at_ms,
                ...(typeof applyResult.billing_cycle_end_at_ms === "number"
                    ? { billing_cycle_end_at_ms: applyResult.billing_cycle_end_at_ms }
                    : {}),
            };
        }

        return {
            ...applyResult,
            revenuecat_app_user_id: revenueCatAppUserId,
        };
    } catch (error) {
        if (syncAttemptId) {
            const releaseNowMs = Date.now();
            await releaseSubscriptionStateReconciliation(ctx, {
                user_id: args.user_id,
                sync_attempt_id: syncAttemptId,
                now_ms: releaseNowMs,
                next_attempt_at_ms: releaseNowMs + getReconciliationFailureBackoffMs(),
            }).catch(() => {
                return null;
            });
        }

        return {
            status: "refresh_failed",
            revenuecat_app_user_id: revenueCatAppUserId,
            error: formatErrorMessage(error),
            should_block_requests:
                existingState?.has_active_subscription === true || snapshotHasActiveSubscription,
            ...(existingState ? { plan_key: existingState.plan_key } : {}),
            ...(typeof existingState?.has_active_subscription === "boolean"
                ? { has_active_subscription: existingState.has_active_subscription }
                : {}),
            ...(typeof existingState?.last_synced_at_ms === "number"
                ? { last_synced_at_ms: existingState.last_synced_at_ms }
                : {}),
            ...(typeof existingState?.billing_cycle_end_at_ms === "number"
                ? { billing_cycle_end_at_ms: existingState.billing_cycle_end_at_ms }
                : {}),
        };
    }
}

export async function processRevenueCatWebhookEventById(
    ctx: SubscriptionStateReconciliationCtx & Pick<ActionCtx, "scheduler">,
    args: {
        event_doc_id: string;
        now_ms: number;
    }
): Promise<{ status: RevenueCatWebhookProcessingStatus }> {
    const eventDoc = (await ctx.runQuery(components.subscriptions.webhook.getRevenueCatEventForProcessing, {
        event_doc_id: args.event_doc_id,
    })) as RevenueCatWebhookEventForProcessing | null;

    if (!eventDoc) {
        return {
            status: "missing",
        };
    }

    if (
        eventDoc.status === "processed" ||
        eventDoc.status === "ignored" ||
        eventDoc.status === "dead_letter"
    ) {
        return {
            status: eventDoc.status,
        };
    }

    if (eventDoc.pending_user_ids.length === 0) {
        const completionResult = await recordRevenueCatEventProcessingProgress(ctx, {
            event_doc_id: args.event_doc_id,
            now_ms: args.now_ms,
            processed_user_ids: [],
            ignored_user_ids: [],
            ...(eventDoc.target_user_ids.length === 0
                ? {
                      status_message: "No SAPO app user id found in webhook payload",
                  }
                : {}),
        });

        return {
            status: mapRevenueCatProgressMutationResultToProcessingStatus(completionResult),
        };
    }

    const processingAttemptId = createRevenueCatEventProcessingAttemptId(args.event_doc_id);
    const leaseAcquisition = await acquireRevenueCatEventProcessingLeases(ctx, {
        event_doc_id: args.event_doc_id,
        user_ids: eventDoc.pending_user_ids,
        processing_attempt_id: processingAttemptId,
        lease_duration_ms: REVENUECAT_EVENT_PROCESSING_LEASE_MS,
    });

    if (
        leaseAcquisition.status === "processed" ||
        leaseAcquisition.status === "ignored" ||
        leaseAcquisition.status === "dead_letter" ||
        leaseAcquisition.status === "missing"
    ) {
        return {
            status: mapProgressMutationStatusToProcessingStatus(leaseAcquisition.status),
        };
    }

    const acquiredUserIds = leaseAcquisition.acquired_user_ids;
    const blockedUserIds = leaseAcquisition.blocked_user_ids;
    const activeProcessingUserIds = leaseAcquisition.active_processing_user_ids;

    if (acquiredUserIds.length === 0) {
        const deferredResult = await recordRevenueCatEventProcessingProgress(ctx, {
            event_doc_id: args.event_doc_id,
            now_ms: args.now_ms,
            processed_user_ids: [],
            ignored_user_ids: [],
            status_message: [
                ...blockedUserIds.map((userId) => `${userId}: user deletion in progress`),
                ...activeProcessingUserIds.map((userId) => `${userId}: processing already active`),
            ].join(" | "),
            next_retry_at_ms: args.now_ms + getReconciliationFailureBackoffMs(),
        });

        return {
            status: mapRevenueCatProgressMutationResultToProcessingStatus(deferredResult),
        };
    }

    const reconciliationAttempts = await Promise.all(
        acquiredUserIds.map(async (userId) => ({
            user_id: userId,
            result: await reconcileSubscriptionStateFromRevenueCat(ctx, {
                user_id: userId,
                force: true,
                now_ms: args.now_ms,
                store_subscription_id_hint:
                    resolveStoreSubscriptionIdHintFromRevenueCatEvent(eventDoc),
                ...(isRevenueCatWebhookActiveSignal(eventDoc.event_type)
                    ? {
                          expects_active_subscription: true,
                          trusted_active_signal: true,
                          active_signal_at_ms: eventDoc.event_at_ms,
                      }
                    : { clear_pending_active_signal: true }),
                revenuecat_event_id: eventDoc.event_id,
                revenuecat_event_at_ms: eventDoc.event_at_ms,
            }),
        }))
    );

    const refreshFailures = reconciliationAttempts.filter(
        (
            attempt
        ): attempt is {
            user_id: string;
            result: Extract<SubscriptionStateRefreshResult, { status: "refresh_failed" }>;
        } => attempt.result.status === "refresh_failed"
    );
    const deletionBlocks = reconciliationAttempts.filter(
        (
            attempt
        ): attempt is {
            user_id: string;
            result: Extract<SubscriptionStateRefreshResult, { status: "deletion_in_progress" }>;
        } => attempt.result.status === "deletion_in_progress"
    );
    const pendingActiveRefreshes = reconciliationAttempts.filter(
        (
            attempt
        ): attempt is {
            user_id: string;
            result: Extract<SubscriptionStateRefreshResult, { status: "pending_active" }>;
        } => attempt.result.status === "pending_active"
    );

    await Promise.all(
        pendingActiveRefreshes.map((attempt) => {
            const signalAtMs = attempt.result.pending_active_signal_at_ms;
            return typeof signalAtMs === "number"
                ? schedulePendingSubscriptionActivationRetry(ctx, {
                      user_id: attempt.user_id,
                      active_signal_at_ms: signalAtMs,
                      retry_index: 0,
                      event_doc_id: args.event_doc_id,
                  })
                : Promise.resolve();
        })
    );
    const syncInProgressRefreshes = reconciliationAttempts.filter(
        (
            attempt
        ): attempt is {
            user_id: string;
            result: Extract<SubscriptionStateRefreshResult, { status: "sync_in_progress" }>;
        } => attempt.result.status === "sync_in_progress"
    );
    const ignoredRefreshes = reconciliationAttempts.filter(
        (
            attempt
        ): attempt is {
            user_id: string;
            result: Extract<SubscriptionStateRefreshResult, { status: "user_missing" }>;
        } => attempt.result.status === "user_missing"
    );

    const successfulRefreshes = reconciliationAttempts.filter(
        (
            attempt
        ): attempt is {
            user_id: string;
            result: Extract<
                SubscriptionStateRefreshResult,
                { status: "already_fresh" | "created" | "updated" | "unchanged" }
            >;
        } =>
            attempt.result.status === "already_fresh" ||
            attempt.result.status === "created" ||
            attempt.result.status === "updated" ||
            attempt.result.status === "unchanged"
    );

    const processedUserIds = successfulRefreshes.map((attempt) => attempt.user_id);
    const ignoredUserIds = ignoredRefreshes.map((attempt) => attempt.user_id);

    if (refreshFailures.length > 0) {
        const failureResult = await recordRevenueCatEventProcessingProgress(ctx, {
            event_doc_id: args.event_doc_id,
            processing_attempt_id: processingAttemptId,
            now_ms: args.now_ms,
            processed_user_ids: processedUserIds,
            ignored_user_ids: ignoredUserIds,
            released_user_ids: acquiredUserIds,
            error_message: refreshFailures
                .map((failure) => `${failure.result.revenuecat_app_user_id}: ${failure.result.error}`)
                .join(" | "),
            retry_config: getWebhookRetryConfig(),
        });

        return {
            status: mapRevenueCatProgressMutationResultToProcessingStatus(failureResult),
        };
    }

    if (
        deletionBlocks.length > 0 ||
        pendingActiveRefreshes.length > 0 ||
        syncInProgressRefreshes.length > 0 ||
        blockedUserIds.length > 0 ||
        activeProcessingUserIds.length > 0
    ) {
        const syncRetryAtMs = syncInProgressRefreshes.reduce<number | null>(
            (earliestRetryAtMs, refresh) => {
                const retryAtMs = refresh.result.retry_at_ms;
                if (typeof retryAtMs !== "number" || retryAtMs <= args.now_ms) {
                    return earliestRetryAtMs;
                }

                return earliestRetryAtMs === null
                    ? retryAtMs
                    : Math.min(earliestRetryAtMs, retryAtMs);
            },
            null
        );
        const deferredResult = await recordRevenueCatEventProcessingProgress(ctx, {
            event_doc_id: args.event_doc_id,
            processing_attempt_id: processingAttemptId,
            now_ms: args.now_ms,
            processed_user_ids: processedUserIds,
            ignored_user_ids: ignoredUserIds,
            released_user_ids: acquiredUserIds,
            status_message: deletionBlocks
                .map((block) => `${block.result.revenuecat_app_user_id}: user deletion in progress`)
                .concat(
                    pendingActiveRefreshes.map(
                        (refresh) => `${refresh.result.revenuecat_app_user_id}: active subscription confirmation pending`
                    )
                )
                .concat(
                    syncInProgressRefreshes.map(
                        (refresh) => `${refresh.result.revenuecat_app_user_id}: subscription sync already active`
                    )
                )
                .concat(blockedUserIds.map((userId) => `${userId}: user deletion in progress`))
                .concat(activeProcessingUserIds.map((userId) => `${userId}: processing already active`))
                .join(" | "),
            next_retry_at_ms:
                syncRetryAtMs ?? args.now_ms + getReconciliationFailureBackoffMs(),
        });

        return {
            status: mapRevenueCatProgressMutationResultToProcessingStatus(deferredResult),
        };
    }

    const completionResult = await recordRevenueCatEventProcessingProgress(ctx, {
        event_doc_id: args.event_doc_id,
        processing_attempt_id: processingAttemptId,
        now_ms: args.now_ms,
        processed_user_ids: processedUserIds,
        ignored_user_ids: ignoredUserIds,
        released_user_ids: acquiredUserIds,
        ...(processedUserIds.length === 0
            ? {
                  status_message: "No matching Better Auth user found for webhook payload",
              }
            : {}),
    });

    return {
        status: mapRevenueCatProgressMutationResultToProcessingStatus(completionResult),
    };
}

export async function reconcileObservedSubscriptionStateHandler(
    ctx: ActionCtx,
    args: { user_id: string; observed_active: boolean }
) {
    const nowMs = Date.now();

    const result = await reconcileSubscriptionStateFromRevenueCat(ctx, {
        user_id: args.user_id,
        force: false,
        now_ms: nowMs,
        client_observed_active: args.observed_active,
        ...(args.observed_active
            ? { expects_active_subscription: true }
            : {}),
        ...(args.observed_active
            ? { active_signal_at_ms: nowMs }
            : {}),
    });

    if (
        result.status === "pending_active" &&
        typeof result.pending_active_signal_at_ms === "number"
    ) {
        await schedulePendingSubscriptionActivationRetry(ctx, {
            user_id: args.user_id,
            active_signal_at_ms: result.pending_active_signal_at_ms,
            retry_index: 0,
        });
    } else if (result.status === "refresh_failed" && args.observed_active) {
        await schedulePendingSubscriptionActivationRetry(ctx, {
            user_id: args.user_id,
            active_signal_at_ms: nowMs,
            retry_index: 0,
        });
    }

    return result;
}

export async function reconcileSubscriptionStateForUsage(
    ctx: ActionCtx,
    args: { user_id: string }
) {
    return reconcileSubscriptionStateFromRevenueCat(ctx, {
        user_id: args.user_id,
        force: false,
        now_ms: Date.now(),
        use_confirmed_state_while_activation_pending: true,
    });
}

export async function retryPendingSubscriptionActivation(
    ctx: ActionCtx,
    args: WorkerArgs.RetryPendingSubscriptionActivationArgs
) {
    const nowMs = Date.now();
    const nextRetryDelayMs = SUBSCRIPTION_ACTIVATION_RETRY_DELAYS_MS[args.retry_index + 1];
    const claim = await claimPendingActiveRetry(ctx, {
        user_id: args.user_id,
        active_signal_at_ms: args.active_signal_at_ms,
        retry_index: args.retry_index,
        now_ms: nowMs,
        next_retry_at_ms: typeof nextRetryDelayMs === "number"
            ? nowMs + nextRetryDelayMs
            : Number.MAX_SAFE_INTEGER,
    });

    if (!claim.claimed) {
        if (claim.expired) {
            await recordOperationalAlert(ctx, {
                kind: "subscription_activation_unconfirmed",
                entity_key: args.user_id,
                severity: "error",
                title: "Subscription activation could not be confirmed",
                message: `RevenueCat did not confirm the active subscription for ${args.user_id} within the activation window.`,
            });
        }
        return { status: "stale" as const };
    }

    const result = await reconcileSubscriptionStateFromRevenueCat(ctx, {
        user_id: args.user_id,
        force: true,
        now_ms: nowMs,
        expects_active_subscription: true,
        active_signal_at_ms: args.active_signal_at_ms,
    });

    if (
        result.status === "pending_active" ||
        result.status === "sync_in_progress" ||
        result.status === "refresh_failed"
    ) {
        await schedulePendingSubscriptionActivationRetry(ctx, {
            user_id: args.user_id,
            active_signal_at_ms: args.active_signal_at_ms,
            retry_index: args.retry_index + 1,
            ...(args.event_doc_id ? { event_doc_id: args.event_doc_id } : {}),
        });
    } else if (args.event_doc_id) {
        await ctx.scheduler.runAfter(
            0,
            internal.subscriptionsWorkers.processRevenueCatWebhookEvent,
            { event_doc_id: args.event_doc_id }
        );
    }

    return { status: result.status };
}

export async function retryPendingSubscriptionActivations(ctx: ActionCtx) {
    const dueRetries = await listPendingActiveRetriesDue(ctx, {
        now_ms: Date.now(),
        limit: 50,
    });

    await Promise.all(
        dueRetries.map((retry) =>
            ctx.scheduler.runAfter(
                0,
                internal.subscriptionsWorkers.retryPendingSubscriptionActivation,
                retry
            )
        )
    );

    return { scheduled_count: dueRetries.length };
}

export const prepareUserAccountDeletion = async (ctx: ActionCtx, args: WorkerArgs.PrepareUserAccountDeletionArgs) => {
        const nowMs = Date.now();
        await startUserDeletionOperationByUserId(ctx, args.user_id, nowMs);

        try {
            // Paid-user deletion needs a confirmed latest quota period before auth deletion.
            const refreshResult = await reconcileSubscriptionStateFromRevenueCat(ctx, {
                user_id: args.user_id,
                force: true,
                now_ms: nowMs,
                allow_user_deletion_in_progress: true,
            });

            if (refreshResult.status === "refresh_failed") {
                console.warn(
                    JSON.stringify({
                        event: "user_deletion_revenuecat_refresh_failed_blocking_auth_delete",
                        user_id: args.user_id,
                        revenuecat_app_user_id: refreshResult.revenuecat_app_user_id,
                        error: refreshResult.error,
                    })
                );

                throw new Error(
                    `Unable to confirm RevenueCat subscription state before account deletion: ${refreshResult.error}`
                );
            }

            if (refreshResult.status === "user_missing") {
                throw new Error("Unable to delete account data for a missing Better Auth user");
            }

            if (refreshResult.status === "deletion_in_progress") {
                throw new Error("Unable to refresh subscription state while account deletion is active");
            }

            if (refreshResult.status === "pending_active") {
                throw new Error("Unable to confirm pending active subscription state before account deletion");
            }

            if (refreshResult.status === "sync_in_progress") {
                throw new Error("Unable to confirm subscription state while another sync is active");
            }

            let deletionSnapshot = await getUserDeletionSnapshotByUserId(ctx, args.user_id);
            let repairedMissingPreservedQuotaPeriod = false;

            if (
                deletionSnapshot.has_active_subscription &&
                typeof deletionSnapshot.current_quota_period_id !== "string"
            ) {
                try {
                    const repairedSnapshot = (await (ctx as any).runMutation(
                        (components.subscriptions.webhook as Record<string, unknown>)
                            .ensureUserDeletionPreservedQuotaPeriod,
                        {
                            user_id: args.user_id,
                            now_ms: nowMs,
                        }
                    )) as UserDeletionSnapshot;

                    deletionSnapshot = repairedSnapshot;

                    if (typeof repairedSnapshot.current_quota_period_id === "string") {
                        repairedMissingPreservedQuotaPeriod = true;
                    }
                } catch (repairError) {
                    console.warn(
                        "Failed to repair missing current quota period during account deletion:",
                        repairError
                    );
                }
            }

            const deletionContext = resolvePreparedUserDeletionContext({
                snapshot: deletionSnapshot,
                fallback_revenuecat_app_user_id: refreshResult.revenuecat_app_user_id,
            });

            assertRequiredPreservedQuotaPeriod({
                user_id: args.user_id,
                has_active_subscription: deletionContext.has_active_subscription,
                preserved_quota_period_id: deletionContext.preserved_quota_period_id,
            });

            await (ctx as any).runMutation(
                (components.subscriptions.webhook as Record<string, unknown>)
                    .upsertUserDeletionPreparation,
                {
                    user_id: args.user_id,
                    revenuecat_app_user_id: deletionContext.revenuecat_app_user_id,
                    has_active_subscription: deletionContext.has_active_subscription,
                    ...(deletionContext.preserved_quota_period_id
                        ? { preserved_quota_period_id: deletionContext.preserved_quota_period_id }
                        : {}),
                    ...(deletionContext.store_subscription_id
                        ? { store_subscription_id: deletionContext.store_subscription_id }
                        : {}),
                    ...(deletionContext.store_subscription_period_id
                        ? {
                              store_subscription_period_id:
                                  deletionContext.store_subscription_period_id,
                          }
                        : {}),
                    prepared_at_ms: nowMs,
                }
            );

            return {
                refresh: refreshResult,
                deletion_snapshot: deletionSnapshot,
                repaired_missing_preserved_quota_period: repairedMissingPreservedQuotaPeriod,
            };
        } catch (error) {
            await clearUserDeletionOperationByUserId(ctx, args.user_id).catch(() => null);
            throw error;
        }
    };

export const queueDeletedUserDataCleanup = async (ctx: ActionCtx, args: WorkerArgs.QueueDeletedUserDataCleanupArgs) => {
        const nowMs = Date.now();

        await markUserDeletionAuthDeletedByUserId(ctx, args.user_id, {
            now_ms: nowMs,
        }).catch((error) => {
            console.warn("Failed to mark queued account deletion as auth-deleted:", error);
        });

        await scheduleQueuedUserDeletionProcessing(ctx, args.user_id, 0).catch((error) => {
            console.warn("Failed to schedule queued account deletion processing:", error);
        });

        return {
            status: "queued" as const,
        };
    };


export async function finalizeDeletedUserDataHandler(
    ctx: ActionCtx,
    args: WorkerArgs.FinalizeDeletedUserDataArgs
) {
        const nowMs = Date.now();

        if (args.mark_auth_deleted === true) {
            try {
                await markUserDeletionAuthDeletedByUserId(ctx, args.user_id, {
                    now_ms: nowMs,
                });
            } catch (error) {
                console.warn("Failed to mark queued account deletion as auth-deleted:", error);
            }
        }

        const cleanupAttemptId = createUserDeletionCleanupAttemptId(args.user_id);
        const acquiredOperation = await acquireUserDeletionOperationByUserId(ctx, args.user_id, {
            now_ms: nowMs,
            lease_expires_at_ms: nowMs + USER_DELETION_CLEANUP_LEASE_MS,
            cleanup_attempt_id: cleanupAttemptId,
            cleanup_step: "acquired",
            ...(args.mark_auth_deleted === true || args.allow_terminal_recovery === true
                ? { allow_terminal_recovery: true }
                : {}),
        });

        if (!acquiredOperation.acquired) {
            return {
                status: acquiredOperation.missing ? ("not_queued" as const) : ("not_due" as const),
                next_retry_at_ms: acquiredOperation.next_retry_at_ms,
            };
        }

        const deletionState: UserDeletionOperationState = {
            in_progress: true,
            ...acquiredOperation.operation,
        };
        let deletionContext = resolveUserDeletionContextFromState(deletionState);

        if (!deletionContext || typeof deletionState.prepared_at_ms !== "number") {
            return handleOwnedUserDeletionCleanupFailure(ctx, {
                user_id: args.user_id,
                cleanup_attempt_id: cleanupAttemptId,
                cleanup_step: "acquired",
                current_retry_count: deletionState.retry_count,
                cleanup_fast_retry_attempt: args.cleanup_fast_retry_attempt,
                error_message: "Missing saved deletion context for queued account deletion",
                auth_deleted_at_ms: deletionState.auth_deleted_at_ms,
            });
        }

        if (typeof deletionContext.preserved_quota_period_id !== "string") {
            try {
                const repairedSnapshot = (await (ctx as any).runMutation(
                    (components.subscriptions.webhook as Record<string, unknown>)
                        .ensureUserDeletionPreservedQuotaPeriod,
                    {
                        user_id: args.user_id,
                        now_ms: nowMs,
                    }
                )) as UserDeletionSnapshot;
                const repairedContext = resolveAuthDeletedUserDeletionContext({
                    snapshot: repairedSnapshot,
                    existing_context: deletionContext,
                });

                const repairedContextChanged =
                    repairedContext.has_active_subscription !== deletionContext.has_active_subscription ||
                    repairedContext.preserved_quota_period_id !==
                        deletionContext.preserved_quota_period_id ||
                    repairedContext.revenuecat_app_user_id !== deletionContext.revenuecat_app_user_id ||
                    repairedContext.store_subscription_id !== deletionContext.store_subscription_id ||
                    repairedContext.store_subscription_period_id !==
                        deletionContext.store_subscription_period_id;

                if (hasRequiredPreservedQuotaPeriod(repairedContext) && repairedContextChanged) {
                    await (ctx as any).runMutation(
                        (components.subscriptions.webhook as Record<string, unknown>)
                            .upsertUserDeletionPreparation,
                        {
                            user_id: args.user_id,
                            revenuecat_app_user_id: repairedContext.revenuecat_app_user_id,
                            has_active_subscription: repairedContext.has_active_subscription,
                            ...(repairedContext.preserved_quota_period_id
                                ? {
                                      preserved_quota_period_id:
                                          repairedContext.preserved_quota_period_id,
                                  }
                                : {}),
                            ...(repairedContext.store_subscription_id
                                ? { store_subscription_id: repairedContext.store_subscription_id }
                                : {}),
                            ...(repairedContext.store_subscription_period_id
                                ? {
                                      store_subscription_period_id:
                                          repairedContext.store_subscription_period_id,
                                  }
                                : {}),
                            prepared_at_ms: deletionState.prepared_at_ms,
                            now_ms: Date.now(),
                            cleanup_attempt_id: cleanupAttemptId,
                        }
                    );
                }

                deletionContext = repairedContext;
            } catch (repairError) {
                console.warn(
                    "Failed to repair missing preserved quota period during account deletion cleanup:",
                    repairError
                );
            }
        }

        if (!hasRequiredPreservedQuotaPeriod(deletionContext)) {
            const errorMessage = getMissingPreservedQuotaPeriodErrorMessage(args.user_id);

            return handleOwnedUserDeletionCleanupFailure(ctx, {
                user_id: args.user_id,
                cleanup_attempt_id: cleanupAttemptId,
                cleanup_step: "acquired",
                current_retry_count: deletionState.retry_count,
                cleanup_fast_retry_attempt: args.cleanup_fast_retry_attempt,
                error_message: errorMessage,
                auth_deleted_at_ms: deletionState.auth_deleted_at_ms,
            });
        }

        const preservedQuotaPeriodId = deletionContext.has_active_subscription
            ? deletionContext.preserved_quota_period_id
            : undefined;
        const betterAuthUser = await getBetterAuthUserCreatedAtMs(ctx, args.user_id);

        if (betterAuthUser.exists) {
            const elapsedAuthDeleteWaitMs = nowMs - acquiredOperation.operation.started_at_ms;
            const authDeleteWaitStatus = resolveUserDeletionAuthDeleteWaitStatus({
                elapsed_ms: elapsedAuthDeleteWaitMs,
                confirm_timeout_ms: USER_DELETION_AUTH_DELETE_CONFIRM_TIMEOUT_MS,
                dead_letter_timeout_ms: USER_DELETION_AUTH_DELETE_DEAD_LETTER_TIMEOUT_MS,
            });

            if (authDeleteWaitStatus === USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS) {
                const leaseLost = await rescheduleOwnedUserDeletionOperation(ctx, args.user_id, cleanupAttemptId, {
                    status: USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS,
                    now_ms: nowMs,
                    next_retry_at_ms: USER_DELETION_TERMINAL_NEXT_RETRY_AT_MS,
                    last_error:
                        "Better Auth deletion was not confirmed within the terminal wait window; automatic cleanup is paused until afterDelete or manual intervention",
                }, "acquired").catch(() => null);

                if (leaseLost) {
                    return leaseLost;
                }

                console.error(
                    JSON.stringify({
                        event: "user_deletion_auth_delete_dead_lettered",
                        user_id: args.user_id,
                        elapsed_auth_delete_wait_ms: elapsedAuthDeleteWaitMs,
                    })
                );
                await recordOperationalAlert(ctx, {
                    kind: "user_deletion_auth_delete_dead_letter",
                    entity_key: args.user_id,
                    severity: "critical",
                    title: "User deletion auth confirmation dead-lettered",
                    message:
                        "Better Auth deletion was not confirmed within the terminal wait window. Automatic cleanup is paused until the auth user is deleted or manual recovery is triggered.",
                    last_error:
                        "Better Auth deletion was not confirmed within the terminal wait window",
                });

                return {
                    status: USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS,
                    next_retry_at_ms: USER_DELETION_TERMINAL_NEXT_RETRY_AT_MS,
                };
            }

            if (authDeleteWaitStatus === USER_DELETION_LATE_AUTH_WAIT_STATUS) {
                const nextRetryAtMs = nowMs + USER_DELETION_CLEANUP_CRON_RETRY_DELAY_MS;

                const leaseLost = await rescheduleOwnedUserDeletionOperation(ctx, args.user_id, cleanupAttemptId, {
                    status: USER_DELETION_LATE_AUTH_WAIT_STATUS,
                    now_ms: nowMs,
                    next_retry_at_ms: nextRetryAtMs,
                    last_error:
                        "Timed out waiting for Better Auth deletion confirmation; continuing cron-based retries",
                }, "acquired").catch(() => null);

                if (leaseLost) {
                    return leaseLost;
                }

                console.warn(
                    JSON.stringify({
                        event: "user_deletion_auth_delete_not_confirmed",
                        user_id: args.user_id,
                        next_retry_at_ms: nextRetryAtMs,
                    })
                );

                return {
                    status: USER_DELETION_LATE_AUTH_WAIT_STATUS,
                    next_retry_at_ms: nextRetryAtMs,
                };
            }

            const nextRetryAtMs = nowMs + USER_DELETION_CLEANUP_CRON_RETRY_DELAY_MS;
            const leaseLost = await rescheduleOwnedUserDeletionOperation(ctx, args.user_id, cleanupAttemptId, {
                status: "awaiting_auth_delete",
                now_ms: nowMs,
                next_retry_at_ms: nextRetryAtMs,
                last_error: null,
            }, "acquired").catch(() => null);

            if (leaseLost) {
                return leaseLost;
            }

            return {
                status: "awaiting_auth_delete" as const,
                next_retry_at_ms: nextRetryAtMs,
            };
        }

        const authDeletedAtMs = deletionState.auth_deleted_at_ms ?? nowMs;
        const quiescenceGraceEndsAtMs = authDeletedAtMs + USER_DELETION_QUIESCENCE_GRACE_MS;

        if (typeof deletionState.auth_deleted_at_ms !== "number") {
            await markUserDeletionAuthDeletedByUserId(ctx, args.user_id, {
                now_ms: authDeletedAtMs,
            }).catch(() => null);
        }

        const leaseLostBeforeQuiescence = await renewUserDeletionCleanupLease(
            ctx,
            args.user_id,
            cleanupAttemptId,
            "waiting_for_quiescence"
        );

        if (leaseLostBeforeQuiescence) {
            return leaseLostBeforeQuiescence;
        }

        const quiescenceSnapshot = await getUserDeletionQuiescenceSnapshotByUserId(
            ctx,
            args.user_id,
            Date.now()
        );

        const quiescenceStatus = resolveUserDeletionQuiescenceStatus({
            active_usage_event_count: quiescenceSnapshot.active_usage_event_count,
            active_revenuecat_event_processing_count:
                quiescenceSnapshot.active_revenuecat_event_processing_count,
            now_ms: Date.now(),
            grace_ends_at_ms: quiescenceGraceEndsAtMs,
        });
        const shouldDeleteActiveUsageEvents = shouldDeleteOverdueActiveUsageEvents({
            quiescence_status: quiescenceStatus,
            active_usage_event_count: quiescenceSnapshot.active_usage_event_count,
            active_revenuecat_event_processing_count:
                quiescenceSnapshot.active_revenuecat_event_processing_count,
        });

        if (quiescenceStatus !== "ready" && !shouldDeleteActiveUsageEvents) {
            const retryNowMs = Date.now();

            if (quiescenceStatus === "overdue") {
                return handleOwnedUserDeletionCleanupFailure(ctx, {
                    user_id: args.user_id,
                    cleanup_attempt_id: cleanupAttemptId,
                    cleanup_step: "waiting_for_quiescence",
                    current_retry_count: deletionState.retry_count,
                    cleanup_fast_retry_attempt: args.cleanup_fast_retry_attempt,
                    error_message:
                        "Timed out waiting for RevenueCat event processing to finish during account deletion",
                    auth_deleted_at_ms: authDeletedAtMs,
                    retry_status: "waiting_for_quiescence",
                });
            }

            const nextRetryAtMs = getUserDeletionQuiescenceRetryAtMs({
                snapshot: quiescenceSnapshot,
                now_ms: retryNowMs,
            });

            const leaseLost = await rescheduleOwnedUserDeletionOperation(ctx, args.user_id, cleanupAttemptId, {
                status: "waiting_for_quiescence",
                now_ms: retryNowMs,
                next_retry_at_ms: nextRetryAtMs,
                last_error: null,
                auth_deleted_at_ms: authDeletedAtMs,
            }, "waiting_for_quiescence").catch(() => null);

            if (leaseLost) {
                return leaseLost;
            }

            try {
                await scheduleQueuedUserDeletionProcessing(
                    ctx,
                    args.user_id,
                    Math.max(0, nextRetryAtMs - Date.now())
                );
            } catch {
                // Cron is the fallback.
            }

            return {
                status: "waiting_for_quiescence" as const,
                quiescence: quiescenceSnapshot,
                next_retry_at_ms: nextRetryAtMs,
            };
        }

        let activeCleanupStep: UserDeletionCleanupStep = "waiting_for_quiescence";

        try {
            const quiescenceResult = {
                active_usage_event_count: quiescenceSnapshot.active_usage_event_count,
                active_revenuecat_event_processing_count:
                    quiescenceSnapshot.active_revenuecat_event_processing_count,
                authoritative_active_usage_event_deletion: shouldDeleteActiveUsageEvents,
            };
            let subscriptionCleanupResult: {
                preserved_quota_period_id: string | null;
                deleted_quota_periods: number;
                deleted_usage_events: number;
                deleted_revenue_cat_events: number;
                has_remaining: boolean;
            };
            let deletedQuotaPeriods = 0;
            let deletedUsageEvents = 0;
            let deletedRevenueCatEvents = 0;
            let subscriptionCleanupBatchCount = 0;

            do {
                activeCleanupStep = "deleting_subscription_data";
                const leaseLostBeforeSubscriptionBatch = await renewUserDeletionCleanupLease(
                    ctx,
                    args.user_id,
                    cleanupAttemptId,
                    "deleting_subscription_data"
                );

                if (leaseLostBeforeSubscriptionBatch) {
                    return leaseLostBeforeSubscriptionBatch;
                }

                subscriptionCleanupResult = await ctx.runMutation(
                    components.subscriptions.webhook.deleteUserSubscriptionData,
                    {
                        user_id: args.user_id,
                        revenuecat_app_user_id: deletionContext.revenuecat_app_user_id,
                        ...(preservedQuotaPeriodId
                            ? { preserved_quota_period_id: preservedQuotaPeriodId }
                            : {}),
                        now_ms: Date.now(),
                    }
                ) as typeof subscriptionCleanupResult;

                deletedQuotaPeriods += subscriptionCleanupResult.deleted_quota_periods;
                deletedUsageEvents += subscriptionCleanupResult.deleted_usage_events;
                deletedRevenueCatEvents += subscriptionCleanupResult.deleted_revenue_cat_events;

                subscriptionCleanupBatchCount += 1;

                if (
                    subscriptionCleanupResult.has_remaining &&
                    subscriptionCleanupBatchCount >= USER_DELETION_SUBSCRIPTION_CLEANUP_MAX_BATCHES
                ) {
                    const retryPlan = getUserDeletionCleanupRetryPlan(
                        Date.now(),
                        args.cleanup_fast_retry_attempt
                    );

                    const leaseLost = await rescheduleOwnedUserDeletionOperation(
                        ctx,
                        args.user_id,
                        cleanupAttemptId,
                        {
                            status: "ready_for_cleanup",
                            now_ms: Date.now(),
                            next_retry_at_ms: retryPlan.next_retry_at_ms,
                            last_error: null,
                            auth_deleted_at_ms: authDeletedAtMs,
                        },
                        "deleting_subscription_data"
                    );

                    if (leaseLost) {
                        return leaseLost;
                    }

                    if (typeof retryPlan.cleanup_fast_retry_attempt === "number") {
                        try {
                            await scheduleQueuedUserDeletionProcessing(
                                ctx,
                                args.user_id,
                                retryPlan.schedule_delay_ms,
                                retryPlan.cleanup_fast_retry_attempt
                            );
                        } catch {
                            // Cron is the fallback.
                        }
                    }

                    return {
                        status: "cleanup_partial" as const,
                        quiescence: quiescenceResult,
                        subscription_cleanup: {
                            ...subscriptionCleanupResult,
                            batch_count: subscriptionCleanupBatchCount,
                            deleted_quota_periods: deletedQuotaPeriods,
                            deleted_usage_events: deletedUsageEvents,
                            deleted_revenue_cat_events: deletedRevenueCatEvents,
                        },
                        next_retry_at_ms: retryPlan.next_retry_at_ms,
                    };
                }
            } while (subscriptionCleanupResult.has_remaining);

            activeCleanupStep = "finalizing_subscription_data";
            const leaseLostBeforeFinalization = await renewUserDeletionCleanupLease(
                ctx,
                args.user_id,
                cleanupAttemptId,
                "finalizing_subscription_data"
            );

            if (leaseLostBeforeFinalization) {
                return leaseLostBeforeFinalization;
            }

            const finalizationResult = await ctx.runMutation(
                components.subscriptions.webhook.finalizeDeletedUserSubscriptionData,
                {
                    user_id: args.user_id,
                    revenuecat_app_user_id: deletionContext.revenuecat_app_user_id,
                    ...(preservedQuotaPeriodId
                        ? { preserved_quota_period_id: preservedQuotaPeriodId }
                        : {}),
                    has_active_subscription: deletionContext.has_active_subscription,
                    ...(deletionContext.store_subscription_id
                        ? { store_subscription_id: deletionContext.store_subscription_id }
                        : {}),
                    ...(deletionContext.store_subscription_period_id
                        ? {
                              store_subscription_period_id:
                                  deletionContext.store_subscription_period_id,
                          }
                        : {}),
                    now_ms: Date.now(),
                }
            );
            activeCleanupStep = "deleting_revenuecat_subscriber";
            const leaseLostBeforeRevenueCatDelete = await renewUserDeletionCleanupLease(
                ctx,
                args.user_id,
                cleanupAttemptId,
                "deleting_revenuecat_subscriber"
            );

            if (leaseLostBeforeRevenueCatDelete) {
                return leaseLostBeforeRevenueCatDelete;
            }

            let revenuecat_delete:
                | Awaited<ReturnType<typeof deleteRevenueCatSubscriber>>
                | { deleted: false; skipped: true; already_completed?: true };

            if (typeof deletionState.revenuecat_deleted_at_ms === "number") {
                revenuecat_delete = {
                    deleted: false,
                    skipped: true,
                    already_completed: true,
                };
            } else if (deletionContext.revenuecat_app_user_id) {
                revenuecat_delete = await deleteRevenueCatSubscriber(
                    deletionContext.revenuecat_app_user_id
                );

                const revenueCatDeletedAtMs = Date.now();
                const markRevenueCatDeletedLeaseLost = await rescheduleOwnedUserDeletionOperation(
                    ctx,
                    args.user_id,
                    cleanupAttemptId,
                    {
                        status: "cleanup_in_progress",
                        now_ms: revenueCatDeletedAtMs,
                        next_retry_at_ms: revenueCatDeletedAtMs + USER_DELETION_CLEANUP_LEASE_MS,
                        last_error: null,
                        auth_deleted_at_ms: authDeletedAtMs,
                        cleanup_step: "deleting_revenuecat_subscriber",
                        cleanup_lease_expires_at_ms:
                            revenueCatDeletedAtMs + USER_DELETION_CLEANUP_LEASE_MS,
                        revenuecat_deleted_at_ms: revenueCatDeletedAtMs,
                    },
                    "deleting_revenuecat_subscriber"
                );

                if (markRevenueCatDeletedLeaseLost) {
                    return markRevenueCatDeletedLeaseLost;
                }
            } else {
                revenuecat_delete = {
                    deleted: false,
                    skipped: true,
                };
            }

            const deletionOperationCleanupResult = await clearUserDeletionOperationByUserId(
                ctx,
                args.user_id,
                {
                    cleanup_attempt_id: cleanupAttemptId,
                    now_ms: Date.now(),
                }
            );

            if (
                deletionOperationCleanupResult.owner_mismatch ||
                deletionOperationCleanupResult.lease_expired ||
                deletionOperationCleanupResult.ownership_failure
            ) {
                return getUserDeletionCleanupLeaseLostResult({
                    step: "deleting_revenuecat_subscriber",
                    ownership_failure: deletionOperationCleanupResult.ownership_failure,
                });
            }

            return {
                status: "completed" as const,
                quiescence: quiescenceResult,
                subscription_cleanup: {
                    ...subscriptionCleanupResult,
                    batch_count: subscriptionCleanupBatchCount,
                    deleted_quota_periods: deletedQuotaPeriods,
                    deleted_usage_events: deletedUsageEvents,
                    deleted_revenue_cat_events: deletedRevenueCatEvents,
                },
                finalization: finalizationResult,
                revenuecat_delete,
                deletion_operation_cleanup: deletionOperationCleanupResult,
            };
        } catch (error) {
            const errorMessage = formatErrorMessage(error);

            return handleOwnedUserDeletionCleanupFailure(ctx, {
                user_id: args.user_id,
                cleanup_attempt_id: cleanupAttemptId,
                cleanup_step: activeCleanupStep,
                current_retry_count: deletionState.retry_count,
                cleanup_fast_retry_attempt: args.cleanup_fast_retry_attempt,
                error_message: errorMessage,
                error,
                minimum_retry_delay_ms: getRevenueCatApiErrorRetryDelayMs(error),
                auth_deleted_at_ms: authDeletedAtMs,
            });
        }
}
export const processQueuedUserDeletions = async (ctx: ActionCtx) => {
        const startedAtMs = Date.now();
        const dueOperations = await listDueUserDeletionOperationUserIds(ctx, {
            now_ms: startedAtMs,
            limit: Math.max(1, Math.min(getRetryBatchLimit(), 25)),
        });
        const results: { user_id: string; status: string; error?: string }[] = [];

        for (const dueOperation of dueOperations) {
            try {
                const result = await finalizeDeletedUserDataHandler(ctx, {
                    user_id: dueOperation.user_id,
                });

                results.push({
                    user_id: dueOperation.user_id,
                    status: result.status ?? "unknown",
                });
            } catch (error) {
                const errorMessage = formatErrorMessage(error);

                console.warn("Failed to process queued user deletion", {
                    user_id: dueOperation.user_id,
                    error: errorMessage,
                });
                results.push({
                    user_id: dueOperation.user_id,
                    status: "failed",
                    error: errorMessage,
                });
            }
        }

        return {
            started_at_ms: startedAtMs,
            scanned: dueOperations.length,
            results,
        };
    };

export const recoverAuthDeleteDeadLetterUserDeletions = async (ctx: ActionCtx) => {
        const startedAtMs = Date.now();
        const deadLetterOperations = await listAuthDeleteDeadLetterUserDeletionOperationUserIds(ctx, {
            limit: Math.max(1, Math.min(getRetryBatchLimit(), 25)),
        });
        const results: { user_id: string; status: string; error?: string }[] = [];

        for (const deadLetterOperation of deadLetterOperations) {
            try {
                const betterAuthUser = await getBetterAuthUserCreatedAtMs(ctx, deadLetterOperation.user_id);

                if (betterAuthUser.exists) {
                    results.push({
                        user_id: deadLetterOperation.user_id,
                        status: "auth_still_exists",
                    });
                    continue;
                }

                const result = await finalizeDeletedUserDataHandler(ctx, {
                    user_id: deadLetterOperation.user_id,
                    allow_terminal_recovery: true,
                });

                results.push({
                    user_id: deadLetterOperation.user_id,
                    status: result.status ?? "unknown",
                });
            } catch (error) {
                const errorMessage = formatErrorMessage(error);

                console.warn("Failed to recover auth-delete dead-letter user deletion", {
                    user_id: deadLetterOperation.user_id,
                    error: errorMessage,
                });
                results.push({
                    user_id: deadLetterOperation.user_id,
                    status: "failed",
                    error: errorMessage,
                });
            }
        }

        return {
            started_at_ms: startedAtMs,
            scanned: deadLetterOperations.length,
            results,
        };
    };

export const recoverCleanupDeadLetterUserDeletions = async (ctx: ActionCtx, args: WorkerArgs.RecoverCleanupDeadLetterUserDeletionsArgs) => {
        const startedAtMs = Date.now();
        const retryImmediately =
            args.retry_immediately === true ||
            typeof args.user_id === "string" ||
            args.dry_run === true;
        const deadLetterOperations = await listCleanupDeadLetterUserDeletionOperationUserIds(ctx, {
            limit: Math.max(1, Math.min(args.limit ?? getRetryBatchLimit(), 25)),
            ...(retryImmediately ? {} : { now_ms: startedAtMs }),
            ...(typeof args.user_id === "string" ? { user_id: args.user_id } : {}),
        });
        const results: { user_id: string; status: string; error?: string }[] = [];

        for (const deadLetterOperation of deadLetterOperations) {
            if (args.dry_run === true) {
                results.push({
                    user_id: deadLetterOperation.user_id,
                    status: "dry_run",
                });
                continue;
            }

            try {
                const result = await finalizeDeletedUserDataHandler(ctx, {
                    user_id: deadLetterOperation.user_id,
                    allow_terminal_recovery: true,
                });

                results.push({
                    user_id: deadLetterOperation.user_id,
                    status: result.status ?? "unknown",
                });
            } catch (error) {
                const errorMessage = formatErrorMessage(error);

                console.warn("Failed to recover cleanup dead-letter user deletion", {
                    user_id: deadLetterOperation.user_id,
                    error: errorMessage,
                });
                results.push({
                    user_id: deadLetterOperation.user_id,
                    status: "failed",
                    error: errorMessage,
                });
            }
        }

        return {
            started_at_ms: startedAtMs,
            scanned: deadLetterOperations.length,
            retry_immediately: retryImmediately,
            dry_run: args.dry_run === true,
            results,
        };
    };

export const checkUserDeletionDeadLetterHealth = async (ctx: ActionCtx) => {
        const [authDeleteDeadLetters, cleanupDeadLetters] = await Promise.all([
            listAuthDeleteDeadLetterUserDeletionOperationUserIds(ctx, {
                limit: 25,
            }),
            listCleanupDeadLetterUserDeletionOperationUserIds(ctx, {
                limit: 25,
            }),
        ]);

        if (authDeleteDeadLetters.length > 0) {
            console.warn(
                JSON.stringify({
                    event: "user_deletion_auth_delete_dead_letters_detected",
                    dead_letter_count: authDeleteDeadLetters.length,
                    sample_user_ids: authDeleteDeadLetters.slice(0, 5).map((item) => item.user_id),
                })
            );
            await recordOperationalAlert(ctx, {
                kind: "user_deletion_auth_delete_dead_letter",
                entity_key: "user_deletion_queue",
                severity: "critical",
                title: "User deletion auth confirmations dead-lettered",
                message: `${authDeleteDeadLetters.length} sampled user deletions are waiting for Better Auth deletion confirmation recovery.`,
                last_error: authDeleteDeadLetters
                    .slice(0, 3)
                    .map((item) => `${item.user_id}: ${item.status}`)
                    .join(" | "),
            });
        }

        if (cleanupDeadLetters.length > 0) {
            console.error(
                JSON.stringify({
                    event: "user_deletion_cleanup_dead_letters_detected",
                    dead_letter_count: cleanupDeadLetters.length,
                    sample_user_ids: cleanupDeadLetters.slice(0, 5).map((item) => item.user_id),
                })
            );
            await recordOperationalAlert(ctx, {
                kind: "user_deletion_cleanup_dead_letter",
                entity_key: "user_deletion_queue",
                severity: "critical",
                title: "User deletion cleanups dead-lettered",
                message: `${cleanupDeadLetters.length} sampled user deletion cleanups require manual recovery.`,
                last_error: cleanupDeadLetters
                    .slice(0, 3)
                    .map((item) => `${item.user_id}: ${item.last_error ?? "unknown"}`)
                    .join(" | "),
            });
        }

        return {
            checked_at_ms: Date.now(),
            auth_delete_dead_letter_count: authDeleteDeadLetters.length,
            cleanup_dead_letter_count: cleanupDeadLetters.length,
        };
    };

export const processRevenueCatWebhookEvent = async (ctx: ActionCtx, args: WorkerArgs.ProcessRevenueCatWebhookEventArgs) => {
        const nowMs = Date.now();

        try {
            return await processRevenueCatWebhookEventById(ctx, {
                event_doc_id: args.event_doc_id,
                now_ms: nowMs,
            });
        } catch (error) {
            await ctx
                .runMutation(components.subscriptions.webhook.recordRevenueCatEventProcessingProgress, {
                    event_doc_id: args.event_doc_id,
                    now_ms: nowMs,
                    processed_user_ids: [],
                    ignored_user_ids: [],
                    error_message: formatErrorMessage(error),
                    retry_config: getWebhookRetryConfig(),
                })
                .catch(() => {
                    return null;
                });

            return {
                status: "failed" as const,
            };
        }
    };

export const retryRevenueCatWebhookEvents = async (ctx: ActionCtx) => {
        const startedAtMs = Date.now();
        const batchLimit = getRetryBatchLimit();
        const halfLimit = Math.max(1, Math.floor(batchLimit / 2));

        const [pendingEventIds, failedEventIds] = await Promise.all([
            ctx.runQuery(components.subscriptions.webhook.listRetryableRevenueCatEvents, {
                status: "pending",
                now_ms: startedAtMs,
                limit: halfLimit,
            }),
            ctx.runQuery(components.subscriptions.webhook.listRetryableRevenueCatEvents, {
                status: "failed",
                now_ms: startedAtMs,
                limit: batchLimit,
            }),
        ]);

        const eventIds = Array.from(new Set([...pendingEventIds, ...failedEventIds])).slice(
            0,
            batchLimit
        );

        let processedCount = 0;
        let failedCount = 0;

        for (const eventId of eventIds) {
            let processingResult: {
                status: RevenueCatWebhookProcessingStatus;
            };

            try {
                processingResult = await processRevenueCatWebhookEventById(ctx, {
                    event_doc_id: eventId,
                    now_ms: Date.now(),
                });
            } catch (error) {
                processingResult = {
                    status: "failed",
                };

                await ctx.runMutation(components.subscriptions.webhook.recordRevenueCatEventProcessingProgress, {
                    event_doc_id: eventId,
                    now_ms: Date.now(),
                    processed_user_ids: [],
                    ignored_user_ids: [],
                    error_message: formatErrorMessage(error),
                    retry_config: getWebhookRetryConfig(),
                });
            }

            if (processingResult.status === "failed" || processingResult.status === "dead_letter") {
                failedCount += 1;
                continue;
            }

            if (
                processingResult.status !== "missing" &&
                processingResult.status !== "deferred"
            ) {
                processedCount += 1;
            }
        }

        return {
            scanned: eventIds.length,
            processed: processedCount,
            failed: failedCount,
            started_at_ms: startedAtMs,
        };
    };

export const reconcileExpiredSubscriptionStates = async (ctx: ActionCtx): Promise<
        | { processed: number; failed: number; scanned: number }
        | { processed: number; failed: number; skipped: string }
    > => {
        const missingRevenueCatReadConfigMessage = getMissingRevenueCatReadApiV2ConfigMessage();
        if (missingRevenueCatReadConfigMessage) {
            return {
                processed: 0,
                failed: 0,
                skipped: missingRevenueCatReadConfigMessage,
            };
        }

        const startedAtMs = Date.now();
        const dueStates = await (ctx as any).runQuery(
            (components.subscriptions.webhook as Record<string, unknown>)
                .listSubscriptionStatesDueForExpirationReconciliation,
            {
                now_ms: startedAtMs,
                limit: getReconciliationBatchLimit(),
            }
        ) as {
            user_id: string;
            revenuecat_app_user_id?: string;
        }[];

        let processed = 0;
        let failed = 0;

        for (const dueState of dueStates) {
            const refreshResult = await reconcileSubscriptionStateFromRevenueCat(ctx, {
                user_id: dueState.user_id,
                force: true,
                now_ms: Date.now(),
            });

            if (refreshResult.status === "sync_in_progress") {
                continue;
            }

            if (
                refreshResult.status !== "refresh_failed" &&
                refreshResult.status !== "deletion_in_progress" &&
                refreshResult.status !== "pending_active"
            ) {
                processed += 1;
                continue;
            }

            failed += 1;

            await ctx.runMutation(components.subscriptions.webhook.deferSubscriptionStateReconciliation, {
                user_id: dueState.user_id,
                next_attempt_at_ms: Date.now() + getReconciliationFailureBackoffMs(),
            });
        }

        return {
            processed,
            failed,
            scanned: dueStates.length,
        };
    };

export const purgeExpiredRevenueCatEvents = async (ctx: ActionCtx) => {
        const nowMs = Date.now();
        const retentionMs = getRevenueCatEventsRetentionMs();
        const olderThanMs = getRevenueCatEventsRetentionCutoffMs(nowMs, retentionMs);

        const statusesToPurge = REVENUECAT_TERMINAL_WEBHOOK_EVENT_STATUSES;

        let deletedCount = 0;

        for (const status of statusesToPurge) {
            const eventDocIds = await ctx.runQuery(
                components.subscriptions.webhook.listRevenueCatEventsEligibleForRetentionPurge,
                {
                    status,
                    older_than_ms: olderThanMs,
                    limit: RETENTION_PURGE_BATCH_LIMIT_PER_STATUS,
                }
            );

            if (eventDocIds.length === 0) {
                continue;
            }

            const deletionResult = await ctx.runMutation(
                components.subscriptions.webhook.purgeRevenueCatEventsById,
                {
                    event_doc_ids: eventDocIds,
                }
            );

            deletedCount += deletionResult.deleted_count;
        }

        return {
            retention_ms: retentionMs,
            older_than_ms: olderThanMs,
            deleted_count: deletedCount,
        };
    };

export const purgeExpiredFrozenQuotaPeriods = async (ctx: ActionCtx) => {
        const nowMs = Date.now();
        const olderThanMs = nowMs - getFrozenQuotaPeriodRetentionMs();
        let batchCount = 0;
        let scannedCount = 0;
        let deletedCount = 0;
        let retainedLinkedCount = 0;

        while (batchCount < FROZEN_QUOTA_PERIOD_PURGE_MAX_BATCHES) {
            const purgeResult = await ctx.runMutation(
                components.subscriptions.webhook.deleteFrozenQuotaPeriodsEligibleForRetentionPurge,
                {
                    older_than_ms: olderThanMs,
                    limit: FROZEN_QUOTA_PERIOD_PURGE_BATCH_LIMIT,
                }
            );

            batchCount += 1;
            scannedCount += purgeResult.scanned_count;
            deletedCount += purgeResult.deleted_count;
            retainedLinkedCount += purgeResult.retained_linked_count;

            if (purgeResult.scanned_count < FROZEN_QUOTA_PERIOD_PURGE_BATCH_LIMIT) {
                break;
            }
        }

        return {
            retention_ms: getFrozenQuotaPeriodRetentionMs(),
            older_than_ms: olderThanMs,
            batch_count: batchCount,
            scanned_count: scannedCount,
            deleted_count: deletedCount,
            retained_linked_count: retainedLinkedCount,
        };
    };

export const checkRevenueCatPipelineHealth = async (ctx: ActionCtx) => {
        const [deadLetterEvents, failedEvents] = await Promise.all([
            ctx.runQuery(components.subscriptions.webhook.listRevenueCatEventsForStatus, {
                status: "dead_letter",
                limit: 25,
            }),
            ctx.runQuery(components.subscriptions.webhook.listRevenueCatEventsForStatus, {
                status: "failed",
                limit: 25,
            }),
        ]);

        if (deadLetterEvents.length > 0) {
            console.warn(
                JSON.stringify({
                    event: "revenuecat_dead_letter_detected",
                    dead_letter_count: deadLetterEvents.length,
                    sample_event_ids: deadLetterEvents
                        .slice(0, 5)
                        .map((item: { event_id: string }) => item.event_id),
                })
            );
            await recordOperationalAlert(ctx, {
                kind: "revenuecat_event_dead_letter",
                entity_key: "revenuecat_events",
                severity: "error",
                title: "RevenueCat webhook events dead-lettered",
                message: `${deadLetterEvents.length} sampled RevenueCat webhook events are dead-lettered.`,
                last_error: deadLetterEvents
                    .slice(0, 3)
                    .map((item: { event_id: string; last_error?: string }) =>
                        `${item.event_id}: ${item.last_error ?? "unknown"}`
                    )
                    .join(" | "),
            });
        }

        if (failedEvents.length > 0) {
            console.warn(
                JSON.stringify({
                    event: "revenuecat_failed_events_detected",
                    failed_count: failedEvents.length,
                    sample_event_ids: failedEvents
                        .slice(0, 5)
                        .map((item: { event_id: string }) => item.event_id),
                })
            );
            await recordOperationalAlert(ctx, {
                kind: "revenuecat_event_failed",
                entity_key: "revenuecat_events",
                severity: "warning",
                title: "RevenueCat webhook events failing",
                message: `${failedEvents.length} sampled RevenueCat webhook events are currently failed and awaiting retry.`,
                last_error: failedEvents
                    .slice(0, 3)
                    .map((item: { event_id: string; last_error?: string }) =>
                        `${item.event_id}: ${item.last_error ?? "unknown"}`
                    )
                    .join(" | "),
            });
        }

        return {
            checked_at_ms: Date.now(),
            dead_letter_count: deadLetterEvents.length,
            failed_count: failedEvents.length,
        };
    };
