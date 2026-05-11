import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalAction, internalQuery, type ActionCtx } from "./_generated/server";
import {
    USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS,
    USER_DELETION_LATE_AUTH_WAIT_STATUS,
    type UserDeletionQueueContext,
    resolvePreparedUserDeletionContext,
    resolveUserDeletionAuthDeleteWaitStatus,
} from "./userDeletionQueue";

import {
    getFrozenQuotaPeriodRetentionMs,
    getReconciliationBatchLimit,
    getReconciliationFailureBackoffMs,
    getRevenueCatEventsRetentionMs,
    getRetryBatchLimit,
    getSubscriptionProcessingConfig,
    getWebhookRetryConfig,
} from "./subscriptionsConfig";
import {
    deleteRevenueCatSubscriber,
    fetchRevenueCatSubscriberSnapshot,
    formatErrorMessage,
    getMissingRevenueCatReadApiV2ConfigMessage,
    getRevenueCatEventsRetentionCutoffMs,
    shouldUseExistingSubscriptionState,
    type CurrentSubscriptionState,
} from "./subscriptions/revenueCatApi";
import {
    acquireRevenueCatEventProcessingLeases,
    acquireUserDeletionOperationByUserId,
    clearUserDeletionOperationByUserId,
    forceStopActiveUserUsageEventsByUserId,
    forceStopUserStreamControlsByUserId,
    getActiveUserDeletionUsageEventCountByUserId,
    getBetterAuthUserCreatedAtMs,
    getUserDeletionOperationStateByUserId,
    getUserDeletionSnapshotByUserId,
    getUserStreamControlQuiescenceByUserId,
    listAuthDeleteDeadLetterUserDeletionOperationUserIds,
    listDueUserDeletionOperationUserIds,
    markUserDeletionAuthDeletedByUserId,
    recordRevenueCatEventProcessingProgress,
    rescheduleUserDeletionOperationByUserId,
    startUserDeletionOperationByUserId,
    type RevenueCatEventProgressMutationResult,
    type RevenueCatWebhookEventForProcessing,
    type SubscriptionStateReconciliationCtx,
    type UserDeletionOperationState,
    type UserDeletionSnapshot,
} from "./subscriptions/workersComponentApi";

const RETENTION_PURGE_BATCH_LIMIT_PER_STATUS = 500;
const FROZEN_QUOTA_PERIOD_PURGE_BATCH_LIMIT = 500;
const FROZEN_QUOTA_PERIOD_PURGE_MAX_BATCHES = 10;
const USER_DELETION_AUTH_DELETE_POLL_INTERVAL_MS = 5_000;
const USER_DELETION_AUTH_DELETE_LATE_POLL_INTERVAL_MS = 5 * 60 * 1000;
const USER_DELETION_AUTH_DELETE_CONFIRM_TIMEOUT_MS = 60_000;
const USER_DELETION_AUTH_DELETE_DEAD_LETTER_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const USER_DELETION_CLEANUP_LEASE_MS = 30_000;
const USER_DELETION_CLEANUP_RETRY_DELAY_MS = 15_000;
const USER_DELETION_FORCE_STOP_GRACE_MS = 2 * 60 * 1000;
const USER_DELETION_SUBSCRIPTION_CLEANUP_MAX_BATCHES = 10;
const USER_DELETION_QUIESCENCE_POLL_INTERVAL_MS = 250;
const USER_DELETION_QUIESCENCE_WAIT_TIMEOUT_MS = 5_000;
const USER_DELETION_FORCE_STOP_SETTLE_TIMEOUT_MS = 2_000;
const USER_DELETION_TERMINAL_NEXT_RETRY_AT_MS = 253402300799999;
const REVENUECAT_EVENT_PROCESSING_LEASE_MS = 10_000;
const sapopinguinoQuotaTerminalStateValidator = v.union(
    v.literal("completed"),
    v.literal("failed_before_charge"),
    v.literal("failed_after_charge"),
    v.literal("user_stopped_before_charge"),
    v.literal("user_stopped_after_charge")
);

const DEFAULT_PLAN_LIMITS = [
    {
        plan_key: "free" as const,
        translate_input_char_limit: 10,
        respell_input_char_limit: 10,
        translate_monthly_char_limit: 3_000,
        respell_monthly_char_limit: 3_000,
        is_active: true,
    },
    {
        plan_key: "polyglot" as const,
        translate_input_char_limit: 1_000,
        respell_input_char_limit: 300,
        translate_monthly_char_limit: 500_000,
        respell_monthly_char_limit: 6_000,
        is_active: true,
    },
];

type SubscriptionStateRefreshResult =
    | {
          status: "already_fresh" | "created" | "updated" | "unchanged";
          revenuecat_app_user_id: string;
          plan_key: "free" | "polyglot";
          has_active_subscription: boolean;
          last_synced_at_ms: number;
          billing_cycle_end_at_ms?: number;
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
          plan_key?: "free" | "polyglot";
          has_active_subscription?: boolean;
          last_synced_at_ms?: number;
          billing_cycle_end_at_ms?: number;
      };

type RevenueCatWebhookProcessingStatus =
    | "missing"
    | "processed"
    | "ignored"
    | "failed"
    | "dead_letter"
    | "deferred";

function mapProgressMutationStatusToProcessingStatus(
    status: RevenueCatEventProgressMutationResult["status"]
): RevenueCatWebhookProcessingStatus {
    if (status === "pending") {
        return "deferred";
    }

    return status;
}

function resolveStoreSubscriptionIdHintFromRevenueCatEvent(
    eventDoc: Pick<RevenueCatWebhookEventForProcessing, "event_type" | "transaction_id">
) {
    if (eventDoc.event_type === "TEMPORARY_ENTITLEMENT_GRANT") {
        return undefined;
    }

    return eventDoc.transaction_id;
}

function sleep(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function logMissingPreservedQuotaPeriodForActiveDeletion(args: {
    user_id: string;
    phase: string;
    has_active_subscription: boolean;
    preserved_quota_period_id?: string;
}) {
    if (
        args.has_active_subscription &&
        typeof args.preserved_quota_period_id !== "string"
    ) {
        console.error(
            JSON.stringify({
                event: "user_deletion_missing_preserved_quota_period",
                user_id: args.user_id,
                phase: args.phase,
            })
        );
    }
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
    const [usageEventCountResult, streamControlQuiescenceResult] = await Promise.all([
        getActiveUserDeletionUsageEventCountByUserId(ctx, userId),
        getUserStreamControlQuiescenceByUserId(ctx, userId, nowMs),
    ]);

    return {
        active_usage_event_count: usageEventCountResult.active_usage_event_count,
        total_stream_control_count: streamControlQuiescenceResult.total_stream_control_count,
        live_stream_control_count: streamControlQuiescenceResult.live_stream_control_count,
        orphaned_stream_control_count: streamControlQuiescenceResult.orphaned_stream_control_count,
    };
}

async function scheduleQueuedUserDeletionProcessing(
    ctx: Pick<ActionCtx, "scheduler">,
    userId: string,
    delayMs: number
) {
    await ctx.scheduler.runAfter(delayMs, internal.subscriptionsWorkers.finalizeDeletedUserData, {
        user_id: userId,
    });
}

async function waitForUserDeletionQuiescence(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string
) {
    const stopRequests = await ctx.runMutation(
        components.sapopinguino.streamControl.requestUserStreamStops,
        {
            userId,
            nowMs: Date.now(),
        }
    );

    const getQuiescenceSnapshot = async () =>
        getUserDeletionQuiescenceSnapshotByUserId(ctx, userId, Date.now());

    const waitUntil = async (deadlineMs: number) => {
        let snapshot = await getQuiescenceSnapshot();

        while (
            (snapshot.active_usage_event_count > 0 || snapshot.live_stream_control_count > 0) &&
            Date.now() < deadlineMs
        ) {
            await sleep(USER_DELETION_QUIESCENCE_POLL_INTERVAL_MS);
            snapshot = await getQuiescenceSnapshot();
        }

        return snapshot;
    };

    const initialSnapshot = await getQuiescenceSnapshot();
    const initialWaitDeadlineMs = Date.now() + USER_DELETION_QUIESCENCE_WAIT_TIMEOUT_MS;
    let snapshot = await waitUntil(initialWaitDeadlineMs);
    let forcedStopResult:
        | {
              forced_stop_count: number;
              active_usage_event_count: number;
          }
        | null = null;
    let forcedStreamControlCleanupResult:
        | {
              deleted_count: number;
          }
        | null = null;

    if (snapshot.active_usage_event_count > 0) {
        forcedStopResult = await forceStopActiveUserUsageEventsByUserId(ctx, userId, Date.now());
    }

    if (snapshot.live_stream_control_count > 0) {
        forcedStreamControlCleanupResult = await forceStopUserStreamControlsByUserId(ctx, userId);
    }

    if (forcedStopResult || forcedStreamControlCleanupResult) {
        snapshot = await waitUntil(Date.now() + USER_DELETION_FORCE_STOP_SETTLE_TIMEOUT_MS);
    }

    if (snapshot.active_usage_event_count > 0 || snapshot.live_stream_control_count > 0) {
        throw new Error(
            "Timed out waiting for active usage events and live stream controls to stop during account deletion"
        );
    }

    return {
        stop_requests: stopRequests,
        initial_active_usage_event_count: initialSnapshot.active_usage_event_count,
        initial_total_stream_control_count: initialSnapshot.total_stream_control_count,
        initial_live_stream_control_count: initialSnapshot.live_stream_control_count,
        initial_orphaned_stream_control_count: initialSnapshot.orphaned_stream_control_count,
        final_active_usage_event_count: snapshot.active_usage_event_count,
        final_total_stream_control_count: snapshot.total_stream_control_count,
        final_live_stream_control_count: snapshot.live_stream_control_count,
        final_orphaned_stream_control_count: snapshot.orphaned_stream_control_count,
        forced_stop_result: forcedStopResult,
        forced_stream_control_cleanup: forcedStreamControlCleanupResult,
    };
}

async function reconcileSubscriptionStateFromRevenueCat(
    ctx: SubscriptionStateReconciliationCtx,
    args: {
        user_id: string;
        force: boolean;
        now_ms: number;
        store_subscription_id_hint?: string;
        allow_user_deletion_in_progress?: boolean;
    }
): Promise<SubscriptionStateRefreshResult> {
    const existingState = (await (ctx as any).runQuery(
        (components.subscriptions.webhook as Record<string, unknown>).getSubscriptionStateByUserId,
        {
            user_id: args.user_id,
        }
    )) as CurrentSubscriptionState | null;
    const revenueCatAppUserId = existingState?.revenuecat_app_user_id ?? args.user_id;
    let snapshotHasActiveSubscription = false;

    if (args.allow_user_deletion_in_progress !== true) {
        const deletionOperationState = await getUserDeletionOperationStateByUserId(ctx, args.user_id);

        if (deletionOperationState.blocks_revenuecat_reconciliation) {
            return {
                status: "deletion_in_progress",
                revenuecat_app_user_id: revenueCatAppUserId,
            };
        }
    }

    if (!args.force && existingState && shouldUseExistingSubscriptionState(existingState, args.now_ms)) {
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

        const snapshot = await fetchRevenueCatSubscriberSnapshot(revenueCatAppUserId, args.now_ms);
        snapshotHasActiveSubscription = snapshot.has_active_subscription;
        const applyResult: {
            status: "created" | "updated" | "unchanged";
            plan_key: "free" | "polyglot";
            has_active_subscription: boolean;
            last_synced_at_ms: number;
            billing_cycle_end_at_ms?: number;
        } = await (ctx as any).runMutation(
            components.subscriptions.webhook.applyReconciledSubscriptionState,
            {
                user_id: args.user_id,
                revenuecat_app_user_id: revenueCatAppUserId,
                ...(typeof betterAuthUser.created_at_ms === "number"
                    ? { signup_at_ms: betterAuthUser.created_at_ms }
                    : {}),
                synced_at_ms: args.now_ms,
                expiration_reconciliation_delay_ms:
                    processingConfig.expiration_reconciliation_delay_ms,
                ...(args.store_subscription_id_hint
                    ? { store_subscription_id_hint: args.store_subscription_id_hint }
                    : {}),
                ...(args.allow_user_deletion_in_progress === true
                    ? { allow_user_deletion_in_progress: true }
                    : {}),
                snapshot,
            }
        );

        return {
            ...applyResult,
            revenuecat_app_user_id: revenueCatAppUserId,
        };
    } catch (error) {
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

async function processRevenueCatWebhookEventById(
    ctx: SubscriptionStateReconciliationCtx,
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
                      status_message: "No non-anonymous app user id found in webhook payload",
                  }
                : {}),
        });

        return {
            status: mapProgressMutationStatusToProcessingStatus(completionResult.status),
        };
    }

    const leaseAcquisition = await acquireRevenueCatEventProcessingLeases(ctx, {
        event_doc_id: args.event_doc_id,
        user_ids: eventDoc.pending_user_ids,
        now_ms: args.now_ms,
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
            status: mapProgressMutationStatusToProcessingStatus(deferredResult.status),
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
            status: mapProgressMutationStatusToProcessingStatus(failureResult.status),
        };
    }

    if (deletionBlocks.length > 0 || blockedUserIds.length > 0 || activeProcessingUserIds.length > 0) {
        const deferredResult = await recordRevenueCatEventProcessingProgress(ctx, {
            event_doc_id: args.event_doc_id,
            now_ms: args.now_ms,
            processed_user_ids: processedUserIds,
            ignored_user_ids: ignoredUserIds,
            released_user_ids: acquiredUserIds,
            status_message: deletionBlocks
                .map((block) => `${block.result.revenuecat_app_user_id}: user deletion in progress`)
                .concat(blockedUserIds.map((userId) => `${userId}: user deletion in progress`))
                .concat(activeProcessingUserIds.map((userId) => `${userId}: processing already active`))
                .join(" | "),
            next_retry_at_ms: args.now_ms + getReconciliationFailureBackoffMs(),
        });

        return {
            status: mapProgressMutationStatusToProcessingStatus(deferredResult.status),
        };
    }

    const completionResult = await recordRevenueCatEventProcessingProgress(ctx, {
        event_doc_id: args.event_doc_id,
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
        status: mapProgressMutationStatusToProcessingStatus(completionResult.status),
    };
}

export const refreshSubscriptionStateFromRevenueCat = internalAction({
    args: {
        user_id: v.string(),
        force: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        return reconcileSubscriptionStateFromRevenueCat(ctx, {
            user_id: args.user_id,
            force: args.force === true,
            now_ms: Date.now(),
        });
    },
});

export const prepareUserAccountDeletion = internalAction({
    args: {
        user_id: v.string(),
    },
    handler: async (ctx, args) => {
        const nowMs = Date.now();
        await startUserDeletionOperationByUserId(ctx, args.user_id, nowMs);

        try {
            // Paid-user deletion needs the latest quota period when RevenueCat is reachable.
            const refreshResult = await reconcileSubscriptionStateFromRevenueCat(ctx, {
                user_id: args.user_id,
                force: true,
                now_ms: nowMs,
                allow_user_deletion_in_progress: true,
            });

            if (refreshResult.status === "refresh_failed") {
                console.warn(
                    JSON.stringify({
                        event: "user_deletion_revenuecat_refresh_failed_using_local_snapshot",
                        user_id: args.user_id,
                        revenuecat_app_user_id: refreshResult.revenuecat_app_user_id,
                        error: refreshResult.error,
                    })
                );
            }

            if (refreshResult.status === "user_missing") {
                throw new Error("Unable to delete account data for a missing Better Auth user");
            }

            if (refreshResult.status === "deletion_in_progress") {
                throw new Error("Unable to refresh subscription state while account deletion is active");
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

            logMissingPreservedQuotaPeriodForActiveDeletion({
                user_id: args.user_id,
                phase: "prepare",
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

            let scheduled_cleanup = true;
            try {
                await scheduleQueuedUserDeletionProcessing(ctx, args.user_id, 0);
            } catch (error) {
                scheduled_cleanup = false;
                console.warn(
                    "Failed to schedule queued account deletion processing after preparation:",
                    error
                );
            }

            return {
                refresh: refreshResult,
                deletion_snapshot: deletionSnapshot,
                used_local_subscription_snapshot_fallback: refreshResult.status === "refresh_failed",
                repaired_missing_preserved_quota_period: repairedMissingPreservedQuotaPeriod,
                scheduled_cleanup,
            };
        } catch (error) {
            await clearUserDeletionOperationByUserId(ctx, args.user_id).catch(() => null);
            throw error;
        }
    },
});

export const finalizeDeletedUserData = internalAction({
    args: {
        user_id: v.string(),
        mark_auth_deleted: v.optional(v.boolean()),
        allow_terminal_recovery: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const nowMs = Date.now();

        if (args.mark_auth_deleted === true) {
            try {
                await markUserDeletionAuthDeletedByUserId(ctx, args.user_id, {
                    now_ms: nowMs,
                    force_stop_after_at_ms: nowMs + USER_DELETION_FORCE_STOP_GRACE_MS,
                });
            } catch (error) {
                console.warn("Failed to mark queued account deletion as auth-deleted:", error);
            }
        }

        const acquiredOperation = await acquireUserDeletionOperationByUserId(ctx, args.user_id, {
            now_ms: nowMs,
            lease_expires_at_ms: nowMs + USER_DELETION_CLEANUP_LEASE_MS,
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
        const deletionContext = resolveUserDeletionContextFromState(deletionState);

        if (!deletionContext || typeof deletionState.prepared_at_ms !== "number") {
            const nextRetryAtMs = Date.now() + USER_DELETION_CLEANUP_RETRY_DELAY_MS;
            await rescheduleUserDeletionOperationByUserId(ctx, args.user_id, {
                status: "retryable_error",
                now_ms: Date.now(),
                next_retry_at_ms: nextRetryAtMs,
                retry_count_increment: 1,
                last_error: "Missing saved deletion context for queued account deletion",
            }).catch(() => null);

            try {
                await scheduleQueuedUserDeletionProcessing(
                    ctx,
                    args.user_id,
                    USER_DELETION_CLEANUP_RETRY_DELAY_MS
                );
            } catch {
                // Cron is the fallback.
            }

            return {
                status: "retryable_error" as const,
                error: "Missing saved deletion context for queued account deletion",
            };
        }

        logMissingPreservedQuotaPeriodForActiveDeletion({
            user_id: args.user_id,
            phase: "finalize",
            has_active_subscription: deletionContext.has_active_subscription,
            preserved_quota_period_id: deletionContext.preserved_quota_period_id,
        });

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
                await rescheduleUserDeletionOperationByUserId(ctx, args.user_id, {
                    status: USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS,
                    now_ms: nowMs,
                    next_retry_at_ms: USER_DELETION_TERMINAL_NEXT_RETRY_AT_MS,
                    last_error:
                        "Better Auth deletion was not confirmed within the terminal wait window; automatic cleanup is paused until afterDelete or manual intervention",
                }).catch(() => null);

                console.error(
                    JSON.stringify({
                        event: "user_deletion_auth_delete_dead_lettered",
                        user_id: args.user_id,
                        elapsed_auth_delete_wait_ms: elapsedAuthDeleteWaitMs,
                    })
                );

                return {
                    status: USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS,
                    next_retry_at_ms: USER_DELETION_TERMINAL_NEXT_RETRY_AT_MS,
                };
            }

            if (authDeleteWaitStatus === USER_DELETION_LATE_AUTH_WAIT_STATUS) {
                const nextRetryAtMs = nowMs + USER_DELETION_AUTH_DELETE_LATE_POLL_INTERVAL_MS;

                await rescheduleUserDeletionOperationByUserId(ctx, args.user_id, {
                    status: USER_DELETION_LATE_AUTH_WAIT_STATUS,
                    now_ms: nowMs,
                    next_retry_at_ms: nextRetryAtMs,
                    last_error:
                        "Timed out waiting for Better Auth deletion confirmation; continuing background polling",
                }).catch(() => null);

                try {
                    await scheduleQueuedUserDeletionProcessing(
                        ctx,
                        args.user_id,
                        USER_DELETION_AUTH_DELETE_LATE_POLL_INTERVAL_MS
                    );
                } catch {
                    // Cron is the fallback.
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

            const nextRetryAtMs = nowMs + USER_DELETION_AUTH_DELETE_POLL_INTERVAL_MS;
            await rescheduleUserDeletionOperationByUserId(ctx, args.user_id, {
                status: "awaiting_auth_delete",
                now_ms: nowMs,
                next_retry_at_ms: nextRetryAtMs,
                last_error: null,
            }).catch(() => null);

            try {
                await scheduleQueuedUserDeletionProcessing(
                    ctx,
                    args.user_id,
                    USER_DELETION_AUTH_DELETE_POLL_INTERVAL_MS
                );
            } catch {
                // Cron is the fallback.
            }

            return {
                status: "awaiting_auth_delete" as const,
                next_retry_at_ms: nextRetryAtMs,
            };
        }

        const authDeletedAtMs = deletionState.auth_deleted_at_ms ?? nowMs;
        const forceStopAfterAtMs =
            deletionState.force_stop_after_at_ms ?? authDeletedAtMs + USER_DELETION_FORCE_STOP_GRACE_MS;

        if (typeof deletionState.auth_deleted_at_ms !== "number") {
            await markUserDeletionAuthDeletedByUserId(ctx, args.user_id, {
                now_ms: authDeletedAtMs,
                force_stop_after_at_ms: forceStopAfterAtMs,
            }).catch(() => null);
        }

        const quiescenceSnapshot = await getUserDeletionQuiescenceSnapshotByUserId(
            ctx,
            args.user_id,
            Date.now()
        );

        if (
            (quiescenceSnapshot.active_usage_event_count > 0 ||
                quiescenceSnapshot.live_stream_control_count > 0) &&
            Date.now() < forceStopAfterAtMs
        ) {
            const nextRetryAtMs = Math.min(
                forceStopAfterAtMs,
                Date.now() + USER_DELETION_CLEANUP_RETRY_DELAY_MS
            );

            await rescheduleUserDeletionOperationByUserId(ctx, args.user_id, {
                status: "waiting_for_quiescence",
                now_ms: Date.now(),
                next_retry_at_ms: nextRetryAtMs,
                last_error: null,
                auth_deleted_at_ms: authDeletedAtMs,
                force_stop_after_at_ms: forceStopAfterAtMs,
            }).catch(() => null);

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

        try {
            const quiescenceResult =
                quiescenceSnapshot.active_usage_event_count > 0 ||
                quiescenceSnapshot.live_stream_control_count > 0
                    ? await waitForUserDeletionQuiescence(ctx, args.user_id)
                    : {
                          stop_requests: {
                              requested_count: 0,
                          },
                          initial_active_usage_event_count:
                              quiescenceSnapshot.active_usage_event_count,
                          initial_total_stream_control_count:
                              quiescenceSnapshot.total_stream_control_count,
                          initial_live_stream_control_count:
                              quiescenceSnapshot.live_stream_control_count,
                          initial_orphaned_stream_control_count:
                              quiescenceSnapshot.orphaned_stream_control_count,
                          final_active_usage_event_count: quiescenceSnapshot.active_usage_event_count,
                          final_total_stream_control_count:
                              quiescenceSnapshot.total_stream_control_count,
                          final_live_stream_control_count:
                              quiescenceSnapshot.live_stream_control_count,
                          final_orphaned_stream_control_count:
                              quiescenceSnapshot.orphaned_stream_control_count,
                          forced_stop_result: null,
                          forced_stream_control_cleanup: null,
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
                    const nextRetryAtMs = Date.now() + USER_DELETION_CLEANUP_RETRY_DELAY_MS;

                    await rescheduleUserDeletionOperationByUserId(ctx, args.user_id, {
                        status: "ready_for_cleanup",
                        now_ms: Date.now(),
                        next_retry_at_ms: nextRetryAtMs,
                        last_error: null,
                        auth_deleted_at_ms: authDeletedAtMs,
                        force_stop_after_at_ms: forceStopAfterAtMs,
                    });

                    try {
                        await scheduleQueuedUserDeletionProcessing(
                            ctx,
                            args.user_id,
                            USER_DELETION_CLEANUP_RETRY_DELAY_MS
                        );
                    } catch {
                        // Cron is the fallback.
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
                        next_retry_at_ms: nextRetryAtMs,
                    };
                }
            } while (subscriptionCleanupResult.has_remaining);

            const streamControlCleanupResult = await ctx.runMutation(
                components.sapopinguino.streamControl.deleteUserStreamControls,
                {
                    userId: args.user_id,
                }
            );
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
            const revenuecat_delete = deletionContext.revenuecat_app_user_id
                ? await deleteRevenueCatSubscriber(deletionContext.revenuecat_app_user_id)
                : {
                      deleted: false,
                      skipped: true,
                  };
            const deletionOperationCleanupResult = await clearUserDeletionOperationByUserId(
                ctx,
                args.user_id
            );

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
                stream_control_cleanup: streamControlCleanupResult,
                finalization: finalizationResult,
                revenuecat_delete,
                deletion_operation_cleanup: deletionOperationCleanupResult,
            };
        } catch (error) {
            const nextRetryAtMs = Date.now() + USER_DELETION_CLEANUP_RETRY_DELAY_MS;
            const errorMessage = formatErrorMessage(error);

            await rescheduleUserDeletionOperationByUserId(ctx, args.user_id, {
                status: "retryable_error",
                now_ms: Date.now(),
                next_retry_at_ms: nextRetryAtMs,
                retry_count_increment: 1,
                last_error: errorMessage,
                auth_deleted_at_ms: authDeletedAtMs,
                force_stop_after_at_ms: forceStopAfterAtMs,
            }).catch(() => null);

            try {
                await scheduleQueuedUserDeletionProcessing(
                    ctx,
                    args.user_id,
                    USER_DELETION_CLEANUP_RETRY_DELAY_MS
                );
            } catch {
                // Cron is the fallback.
            }

            return {
                status: "retryable_error" as const,
                error: errorMessage,
                next_retry_at_ms: nextRetryAtMs,
            };
        }
    },
});

export const processQueuedUserDeletions = internalAction({
    args: {},
    handler: async (ctx) => {
        const startedAtMs = Date.now();
        const dueOperations = await listDueUserDeletionOperationUserIds(ctx, {
            now_ms: startedAtMs,
            limit: Math.max(1, Math.min(getRetryBatchLimit(), 25)),
        });
        const results: { user_id: string; status: string }[] = [];

        for (const dueOperation of dueOperations) {
            const result = (await ctx.runAction(internal.subscriptionsWorkers.finalizeDeletedUserData, {
                user_id: dueOperation.user_id,
            })) as { status?: string };

            results.push({
                user_id: dueOperation.user_id,
                status: result.status ?? "unknown",
            });
        }

        return {
            started_at_ms: startedAtMs,
            scanned: dueOperations.length,
            results,
        };
    },
});

export const recoverAuthDeleteDeadLetterUserDeletions = internalAction({
    args: {},
    handler: async (ctx) => {
        const startedAtMs = Date.now();
        const deadLetterOperations = await listAuthDeleteDeadLetterUserDeletionOperationUserIds(ctx, {
            limit: Math.max(1, Math.min(getRetryBatchLimit(), 25)),
        });
        const results: { user_id: string; status: string }[] = [];

        for (const deadLetterOperation of deadLetterOperations) {
            const betterAuthUser = await getBetterAuthUserCreatedAtMs(ctx, deadLetterOperation.user_id);

            if (betterAuthUser.exists) {
                results.push({
                    user_id: deadLetterOperation.user_id,
                    status: "auth_still_exists",
                });
                continue;
            }

            const result = (await ctx.runAction(internal.subscriptionsWorkers.finalizeDeletedUserData, {
                user_id: deadLetterOperation.user_id,
                allow_terminal_recovery: true,
            })) as { status?: string };

            results.push({
                user_id: deadLetterOperation.user_id,
                status: result.status ?? "unknown",
            });
        }

        return {
            started_at_ms: startedAtMs,
            scanned: deadLetterOperations.length,
            results,
        };
    },
});

export const processSapopinguinoQuotaFinalizationRecovery = internalAction({
    args: {
        usage_event_id: v.string(),
    },
    handler: async (ctx, args): Promise<unknown> => {
        return (ctx as any).runAction(
            (internal as any).sapopinguinoWorkers.processSapopinguinoQuotaFinalizationRecovery,
            {
                usage_event_id: args.usage_event_id,
            }
        );
    },
});

export const processQueuedSapopinguinoQuotaFinalizationRecoveries = internalAction({
    args: {},
    handler: async (ctx): Promise<unknown> => {
        return (ctx as any).runAction(
            (internal as any).sapopinguinoWorkers.processQueuedSapopinguinoQuotaFinalizationRecoveries,
            {}
        );
    },
});

export const reconcileUsageEventQuotaApplication = internalAction({
    args: {
        // Component document IDs become opaque strings at the app boundary.
        usage_event_id: v.string(),
        terminal_state: v.optional(sapopinguinoQuotaTerminalStateValidator),
        attempt: v.optional(v.number()),
    },
    handler: async (ctx, args): Promise<unknown> => {
        return (ctx as any).runAction(
            (internal as any).sapopinguinoWorkers.reconcileUsageEventQuotaApplication,
            {
                usage_event_id: args.usage_event_id,
                ...(args.terminal_state ? { terminal_state: args.terminal_state } : {}),
                ...(typeof args.attempt === "number" ? { attempt: args.attempt } : {}),
            }
        );
    },
});

export const pruneStaleSapopinguinoStreamControls = internalAction({
    args: {},
    handler: async (ctx): Promise<unknown> => {
        return (ctx as any).runAction(
            (internal as any).sapopinguinoWorkers.pruneStaleSapopinguinoStreamControls,
            {}
        );
    },
});

export const processRevenueCatWebhookEvent = internalAction({
    args: {
        // Validate this inside the subscriptions component, not against the app schema.
        event_doc_id: v.string(),
    },
    handler: async (ctx, args) => {
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
    },
});

export const retryRevenueCatWebhookEvents = internalAction({
    args: {},
    handler: async (ctx) => {
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
    },
});
export const reconcileExpiredSubscriptionStates = internalAction({
    args: {},
    handler: async (ctx): Promise<
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

            if (
                refreshResult.status !== "refresh_failed" &&
                refreshResult.status !== "deletion_in_progress"
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
    },
});

export const ensureSubscriptionPlanLimits = internalAction({
    args: {},
    handler: async (ctx) => {
        await ctx.runMutation(components.subscriptions.webhook.upsertSubscriptionPlanLimits, {
            plans: DEFAULT_PLAN_LIMITS,
            now_ms: Date.now(),
        });

        return {
            status: "ok",
            plans: DEFAULT_PLAN_LIMITS.length,
        };
    },
});

export const purgeExpiredRevenueCatEvents = internalAction({
    args: {},
    handler: async (ctx) => {
        const nowMs = Date.now();
        const retentionMs = getRevenueCatEventsRetentionMs();
        const olderThanMs = getRevenueCatEventsRetentionCutoffMs(nowMs, retentionMs);

        if (olderThanMs === null || retentionMs === null) {
            return {
                skipped: "Missing or invalid REVENUECAT_EVENTS_RETENTION_MS",
                deleted_count: 0,
            };
        }

        const statusesToPurge: ("processed" | "ignored" | "dead_letter")[] = [
            "processed",
            "ignored",
            "dead_letter",
        ];

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
    },
});

export const purgeExpiredFrozenQuotaPeriods = internalAction({
    args: {},
    handler: async (ctx) => {
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

            if (
                purgeResult.scanned_count < FROZEN_QUOTA_PERIOD_PURGE_BATCH_LIMIT ||
                purgeResult.deleted_count === 0
            ) {
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
    },
});

export const checkRevenueCatPipelineHealth = internalAction({
    args: {},
    handler: async (ctx) => {
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
        }

        return {
            checked_at_ms: Date.now(),
            dead_letter_count: deadLetterEvents.length,
            failed_count: failedEvents.length,
        };
    },
});

export const getRevenueCatPipelineHealthSnapshot = internalQuery({
    args: {
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = Math.max(1, Math.min(args.limit ?? 25, 100));

        const [deadLetterEvents, failedEvents, pendingEvents] = await Promise.all([
            ctx.runQuery(components.subscriptions.webhook.listRevenueCatEventsForStatus, {
                status: "dead_letter",
                limit,
            }),
            ctx.runQuery(components.subscriptions.webhook.listRevenueCatEventsForStatus, {
                status: "failed",
                limit,
            }),
            ctx.runQuery(components.subscriptions.webhook.listRevenueCatEventsForStatus, {
                status: "pending",
                limit,
            }),
        ]);

        return {
            sampled_at_ms: Date.now(),
            dead_letter_events: deadLetterEvents,
            failed_events: failedEvents,
            pending_events: pendingEvents,
        };
    },
});
