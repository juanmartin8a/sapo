import { v, type ObjectType } from "convex/values";
import { REVENUECAT_WEBHOOK_EVENT_STATUSES } from "../../constants/revenueCat";
import {
    USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS,
    USER_DELETION_CLEANUP_DEAD_LETTER_STATUS,
    USER_DELETION_CLEANUP_STEP,
    USER_DELETION_LATE_AUTH_WAIT_STATUS,
    USER_DELETION_QUEUE_STATUS,
} from "../../constants/userDeletion";
import { subscriptionUsageOperationValidator } from "../model/planLimits";

export const webhookEventStatusValidator = v.union(
    v.literal(REVENUECAT_WEBHOOK_EVENT_STATUSES.PENDING),
    v.literal(REVENUECAT_WEBHOOK_EVENT_STATUSES.FAILED),
    v.literal(REVENUECAT_WEBHOOK_EVENT_STATUSES.PROCESSED),
    v.literal(REVENUECAT_WEBHOOK_EVENT_STATUSES.IGNORED),
    v.literal(REVENUECAT_WEBHOOK_EVENT_STATUSES.DEAD_LETTER),
);

const terminalWebhookEventStatusValidator = v.union(
    v.literal(REVENUECAT_WEBHOOK_EVENT_STATUSES.PROCESSED),
    v.literal(REVENUECAT_WEBHOOK_EVENT_STATUSES.IGNORED),
    v.literal(REVENUECAT_WEBHOOK_EVENT_STATUSES.DEAD_LETTER),
);

export const normalizedWebhookEventFields = {
    event_id: v.string(),
    event_type: v.string(),
    event_at_ms: v.number(),
    app_user_id: v.optional(v.string()),
    original_app_user_id: v.optional(v.string()),
    aliases: v.array(v.string()),
    transferred_from: v.array(v.string()),
    transferred_to: v.array(v.string()),
    user_id: v.optional(v.string()),
    entitlement_ids: v.array(v.string()),
    product_id: v.optional(v.string()),
    transaction_id: v.optional(v.string()),
    store: v.optional(v.string()),
    environment: v.optional(v.string()),
    expiration_at_ms: v.optional(v.number()),
    grace_period_expiration_at_ms: v.optional(v.number()),
    purchased_at_ms: v.optional(v.number()),
};

const normalizedWebhookEventValidator = v.object(normalizedWebhookEventFields);

const retryConfigValidator = v.object({
    max_retry_count: v.number(),
    retry_base_delay_ms: v.number(),
    retry_max_delay_ms: v.number(),
});

const reconciliationSnapshotValidator = v.object({
    has_active_subscription: v.boolean(),
    access_expires_at_ms: v.optional(v.number()),
    entitlement_id: v.optional(v.string()),
    product_id: v.optional(v.string()),
    store_subscription_id: v.optional(v.string()),
    period_start_at_ms: v.optional(v.number()),
    period_end_at_ms: v.optional(v.number()),
    store: v.optional(v.string()),
    environment: v.optional(v.string()),
});

export const userDeletionQueueStatusValidator = v.union(
    v.literal(USER_DELETION_QUEUE_STATUS.PREPARING),
    v.literal(USER_DELETION_QUEUE_STATUS.AWAITING_AUTH_DELETE),
    v.literal(USER_DELETION_LATE_AUTH_WAIT_STATUS),
    v.literal(USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS),
    v.literal(USER_DELETION_CLEANUP_DEAD_LETTER_STATUS),
    v.literal(USER_DELETION_QUEUE_STATUS.READY_FOR_CLEANUP),
    v.literal(USER_DELETION_QUEUE_STATUS.WAITING_FOR_QUIESCENCE),
    v.literal(USER_DELETION_QUEUE_STATUS.RETRYABLE_ERROR),
    v.literal(USER_DELETION_QUEUE_STATUS.CLEANUP_IN_PROGRESS),
);

export const userDeletionCleanupStepValidator = v.union(
    v.literal(USER_DELETION_CLEANUP_STEP.ACQUIRED),
    v.literal(USER_DELETION_CLEANUP_STEP.WAITING_FOR_QUIESCENCE),
    v.literal(USER_DELETION_CLEANUP_STEP.DELETING_SUBSCRIPTION_DATA),
    v.literal(USER_DELETION_CLEANUP_STEP.FINALIZING_SUBSCRIPTION_DATA),
    v.literal(USER_DELETION_CLEANUP_STEP.DELETING_REVENUECAT_SUBSCRIBER),
);

export const reserveSubscriptionQuotaUsageArgs = {
    req_id: v.string(),
    user_id: v.string(),
    operation: subscriptionUsageOperationValidator,
    input_char_count: v.number(),
    signup_at_ms: v.optional(v.number()),
    model: v.optional(v.string()),
    now_ms: v.number(),
};

export type ReserveSubscriptionQuotaUsageArgs = ObjectType<
    typeof reserveSubscriptionQuotaUsageArgs
>;

export const chargeSubscriptionQuotaUsageArgs = {
    usage_event_id: v.id("usage_events"),
    now_ms: v.number(),
};

export type ChargeSubscriptionQuotaUsageArgs = ObjectType<
    typeof chargeSubscriptionQuotaUsageArgs
>;

export const completeSubscriptionQuotaUsageArgs = {
    usage_event_id: v.id("usage_events"),
    now_ms: v.number(),
};

export type CompleteSubscriptionQuotaUsageArgs = ObjectType<
    typeof completeSubscriptionQuotaUsageArgs
>;

export const markSubscriptionQuotaUsageFailedArgs = {
    usage_event_id: v.id("usage_events"),
    now_ms: v.number(),
};

export type MarkSubscriptionQuotaUsageFailedArgs = ObjectType<
    typeof markSubscriptionQuotaUsageFailedArgs
>;

export const finalizeStaleSubscriptionQuotaUsageArgs = {
    usage_event_id: v.id("usage_events"),
    now_ms: v.number(),
};

export type FinalizeStaleSubscriptionQuotaUsageArgs = ObjectType<
    typeof finalizeStaleSubscriptionQuotaUsageArgs
>;

export const ingestRevenueCatEventArgs = {
    normalized_event: normalizedWebhookEventValidator,
    raw_payload: v.optional(v.string()),
    received_at_ms: v.number(),
};

export type IngestRevenueCatEventArgs = ObjectType<
    typeof ingestRevenueCatEventArgs
>;

export const getRevenueCatEventForProcessingArgs = {
    event_doc_id: v.id("revenue_cat_events"),
};

export type GetRevenueCatEventForProcessingArgs = ObjectType<
    typeof getRevenueCatEventForProcessingArgs
>;

export const acquireRevenueCatEventProcessingLeasesArgs = {
    event_doc_id: v.id("revenue_cat_events"),
    user_ids: v.array(v.string()),
    processing_attempt_id: v.string(),
    lease_duration_ms: v.number(),
};

export type AcquireRevenueCatEventProcessingLeasesArgs = ObjectType<
    typeof acquireRevenueCatEventProcessingLeasesArgs
>;

export const getActiveRevenueCatEventProcessingForUserDeletionArgs = {
    user_id: v.string(),
    now_ms: v.number(),
    limit: v.number(),
};

export type GetActiveRevenueCatEventProcessingForUserDeletionArgs = ObjectType<
    typeof getActiveRevenueCatEventProcessingForUserDeletionArgs
>;

export const recordRevenueCatEventProcessingProgressArgs = {
    event_doc_id: v.id("revenue_cat_events"),
    processing_attempt_id: v.optional(v.string()),
    now_ms: v.number(),
    processed_user_ids: v.array(v.string()),
    ignored_user_ids: v.array(v.string()),
    released_user_ids: v.optional(v.array(v.string())),
    status_message: v.optional(v.string()),
    next_retry_at_ms: v.optional(v.number()),
    error_message: v.optional(v.string()),
    retry_config: v.optional(retryConfigValidator),
};

export type RecordRevenueCatEventProcessingProgressArgs = ObjectType<
    typeof recordRevenueCatEventProcessingProgressArgs
>;

export const listRetryableRevenueCatEventsArgs = {
    status: webhookEventStatusValidator,
    now_ms: v.number(),
    limit: v.number(),
};

export type ListRetryableRevenueCatEventsArgs = ObjectType<
    typeof listRetryableRevenueCatEventsArgs
>;

export const listRevenueCatEventsForStatusArgs = {
    status: webhookEventStatusValidator,
    limit: v.number(),
};

export type ListRevenueCatEventsForStatusArgs = ObjectType<
    typeof listRevenueCatEventsForStatusArgs
>;

export const listRevenueCatEventsEligibleForRetentionPurgeArgs = {
    status: terminalWebhookEventStatusValidator,
    older_than_ms: v.number(),
    limit: v.number(),
};

export type ListRevenueCatEventsEligibleForRetentionPurgeArgs = ObjectType<
    typeof listRevenueCatEventsEligibleForRetentionPurgeArgs
>;

export const purgeRevenueCatEventsByIdArgs = {
    event_doc_ids: v.array(v.id("revenue_cat_events")),
};

export type PurgeRevenueCatEventsByIdArgs = ObjectType<
    typeof purgeRevenueCatEventsByIdArgs
>;

export const deleteFrozenQuotaPeriodsEligibleForRetentionPurgeArgs = {
    older_than_ms: v.number(),
    limit: v.number(),
};

export type DeleteFrozenQuotaPeriodsEligibleForRetentionPurgeArgs = ObjectType<
    typeof deleteFrozenQuotaPeriodsEligibleForRetentionPurgeArgs
>;

export const getSubscriptionStateByUserIdArgs = {
    user_id: v.string(),
};

export type GetSubscriptionStateByUserIdArgs = ObjectType<
    typeof getSubscriptionStateByUserIdArgs
>;

export const beginSubscriptionStateReconciliationArgs = {
    user_id: v.string(),
    revenuecat_app_user_id: v.string(),
    signup_at_ms: v.optional(v.number()),
    sync_attempt_id: v.string(),
    now_ms: v.number(),
    lease_duration_ms: v.number(),
    expects_active_subscription: v.optional(v.boolean()),
    trusted_active_signal: v.optional(v.boolean()),
    active_signal_at_ms: v.optional(v.number()),
    active_signal_ttl_ms: v.optional(v.number()),
    client_reconciliation: v.optional(v.boolean()),
    clear_pending_active_signal: v.optional(v.boolean()),
    revenuecat_event_at_ms: v.optional(v.number()),
    expected_last_synced_at_ms: v.optional(v.number()),
    expected_expiration_reconciliation_at_ms: v.optional(v.number()),
};

export type BeginSubscriptionStateReconciliationArgs = ObjectType<
    typeof beginSubscriptionStateReconciliationArgs
>;

export const claimPendingActiveRetryArgs = {
    user_id: v.string(),
    active_signal_at_ms: v.number(),
    retry_index: v.number(),
    now_ms: v.number(),
    next_retry_at_ms: v.number(),
};

export type ClaimPendingActiveRetryArgs = ObjectType<
    typeof claimPendingActiveRetryArgs
>;

export const expirePendingActiveSignalArgs = {
    user_id: v.string(),
    active_signal_at_ms: v.number(),
    now_ms: v.number(),
};

export type ExpirePendingActiveSignalArgs = ObjectType<
    typeof expirePendingActiveSignalArgs
>;

export const releaseSubscriptionStateReconciliationArgs = {
    user_id: v.string(),
    sync_attempt_id: v.string(),
    now_ms: v.number(),
    next_attempt_at_ms: v.optional(v.number()),
};

export type ReleaseSubscriptionStateReconciliationArgs = ObjectType<
    typeof releaseSubscriptionStateReconciliationArgs
>;

export const getUserDeletionSnapshotArgs = {
    user_id: v.string(),
};

export type GetUserDeletionSnapshotArgs = ObjectType<
    typeof getUserDeletionSnapshotArgs
>;

export const ensureUserDeletionPreservedQuotaPeriodArgs = {
    user_id: v.string(),
    now_ms: v.number(),
};

export type EnsureUserDeletionPreservedQuotaPeriodArgs = ObjectType<
    typeof ensureUserDeletionPreservedQuotaPeriodArgs
>;

export const getUserDeletionOperationStateArgs = {
    user_id: v.string(),
};

export type GetUserDeletionOperationStateArgs = ObjectType<
    typeof getUserDeletionOperationStateArgs
>;

export const listDueUserDeletionOperationsArgs = {
    now_ms: v.number(),
    limit: v.number(),
};

export type ListDueUserDeletionOperationsArgs = ObjectType<
    typeof listDueUserDeletionOperationsArgs
>;

export const listAuthDeleteDeadLetterUserDeletionOperationsArgs = {
    limit: v.number(),
};

export type ListAuthDeleteDeadLetterUserDeletionOperationsArgs = ObjectType<
    typeof listAuthDeleteDeadLetterUserDeletionOperationsArgs
>;

export const listCleanupDeadLetterUserDeletionOperationsArgs = {
    limit: v.number(),
    now_ms: v.optional(v.number()),
    user_id: v.optional(v.string()),
};

export type ListCleanupDeadLetterUserDeletionOperationsArgs = ObjectType<
    typeof listCleanupDeadLetterUserDeletionOperationsArgs
>;

export const getActiveUserDeletionUsageEventCountArgs = {
    user_id: v.string(),
};

export type GetActiveUserDeletionUsageEventCountArgs = ObjectType<
    typeof getActiveUserDeletionUsageEventCountArgs
>;

export const listSubscriptionStatesDueForExpirationReconciliationArgs = {
    now_ms: v.number(),
    limit: v.number(),
};

export type ListSubscriptionStatesDueForExpirationReconciliationArgs =
    ObjectType<typeof listSubscriptionStatesDueForExpirationReconciliationArgs>;

export const applyReconciledSubscriptionStateArgs = {
    user_id: v.string(),
    revenuecat_app_user_id: v.string(),
    signup_at_ms: v.optional(v.number()),
    synced_at_ms: v.number(),
    sync_attempt_id: v.string(),
    store_subscription_id_hint: v.optional(v.string()),
    allow_user_deletion_in_progress: v.optional(v.boolean()),
    expects_active_subscription: v.optional(v.boolean()),
    trusted_active_signal: v.optional(v.boolean()),
    active_signal_at_ms: v.optional(v.number()),
    active_signal_ttl_ms: v.optional(v.number()),
    clear_pending_active_signal: v.optional(v.boolean()),
    revenuecat_event_id: v.optional(v.string()),
    revenuecat_event_at_ms: v.optional(v.number()),
    snapshot: reconciliationSnapshotValidator,
};

export type ApplyReconciledSubscriptionStateArgs = ObjectType<
    typeof applyReconciledSubscriptionStateArgs
>;

export const startUserDeletionOperationArgs = {
    user_id: v.string(),
    now_ms: v.number(),
};

export type StartUserDeletionOperationArgs = ObjectType<
    typeof startUserDeletionOperationArgs
>;

export const clearUserDeletionOperationArgs = {
    user_id: v.string(),
    cleanup_attempt_id: v.optional(v.string()),
    now_ms: v.optional(v.number()),
};

export type ClearUserDeletionOperationArgs = ObjectType<
    typeof clearUserDeletionOperationArgs
>;

export const upsertUserDeletionPreparationArgs = {
    user_id: v.string(),
    revenuecat_app_user_id: v.optional(v.string()),
    has_active_subscription: v.boolean(),
    preserved_quota_period_id: v.optional(v.id("quota_periods")),
    store_subscription_id: v.optional(v.string()),
    store_subscription_period_id: v.optional(v.string()),
    prepared_at_ms: v.number(),
    now_ms: v.optional(v.number()),
    cleanup_attempt_id: v.optional(v.string()),
};

export type UpsertUserDeletionPreparationArgs = ObjectType<
    typeof upsertUserDeletionPreparationArgs
>;

export const markUserDeletionAuthDeletedArgs = {
    user_id: v.string(),
    now_ms: v.number(),
};

export type MarkUserDeletionAuthDeletedArgs = ObjectType<
    typeof markUserDeletionAuthDeletedArgs
>;

export const acquireUserDeletionOperationArgs = {
    user_id: v.string(),
    now_ms: v.number(),
    lease_expires_at_ms: v.number(),
    cleanup_attempt_id: v.string(),
    cleanup_step: v.optional(userDeletionCleanupStepValidator),
    allow_terminal_recovery: v.optional(v.boolean()),
};

export type AcquireUserDeletionOperationArgs = ObjectType<
    typeof acquireUserDeletionOperationArgs
>;

export const renewUserDeletionOperationCleanupLeaseArgs = {
    user_id: v.string(),
    cleanup_attempt_id: v.string(),
    cleanup_step: userDeletionCleanupStepValidator,
    now_ms: v.number(),
    lease_expires_at_ms: v.number(),
};

export type RenewUserDeletionOperationCleanupLeaseArgs = ObjectType<
    typeof renewUserDeletionOperationCleanupLeaseArgs
>;

export const rescheduleUserDeletionOperationArgs = {
    user_id: v.string(),
    status: userDeletionQueueStatusValidator,
    now_ms: v.number(),
    next_retry_at_ms: v.number(),
    retry_count_increment: v.optional(v.number()),
    last_error: v.optional(v.union(v.string(), v.null())),
    auth_deleted_at_ms: v.optional(v.number()),
    cleanup_attempt_id: v.optional(v.string()),
    cleanup_step: v.optional(userDeletionCleanupStepValidator),
    cleanup_lease_expires_at_ms: v.optional(v.number()),
    revenuecat_deleted_at_ms: v.optional(v.number()),
};

export type RescheduleUserDeletionOperationArgs = ObjectType<
    typeof rescheduleUserDeletionOperationArgs
>;

export const deleteUserSubscriptionDataArgs = {
    user_id: v.string(),
    revenuecat_app_user_id: v.optional(v.string()),
    preserved_quota_period_id: v.optional(v.id("quota_periods")),
    now_ms: v.number(),
};

export type DeleteUserSubscriptionDataArgs = ObjectType<
    typeof deleteUserSubscriptionDataArgs
>;

export const finalizeDeletedUserSubscriptionDataArgs = {
    user_id: v.string(),
    revenuecat_app_user_id: v.optional(v.string()),
    preserved_quota_period_id: v.optional(v.id("quota_periods")),
    has_active_subscription: v.boolean(),
    store_subscription_id: v.optional(v.string()),
    store_subscription_period_id: v.optional(v.string()),
    now_ms: v.number(),
};

export type FinalizeDeletedUserSubscriptionDataArgs = ObjectType<
    typeof finalizeDeletedUserSubscriptionDataArgs
>;

export const deferSubscriptionStateReconciliationArgs = {
    user_id: v.string(),
    expected_last_synced_at_ms: v.number(),
    expected_expiration_reconciliation_at_ms: v.number(),
    next_attempt_at_ms: v.number(),
};

export type DeferSubscriptionStateReconciliationArgs = ObjectType<
    typeof deferSubscriptionStateReconciliationArgs
>;
