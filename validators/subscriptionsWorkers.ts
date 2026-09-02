import { v, type ObjectType } from "convex/values";
import { beginSubscriptionStateReconciliationArgs } from "../subscriptions/validators/webhook";

const pendingSubscriptionActivationRetryArgs = {
    user_id: v.string(),
    active_signal_at_ms: v.number(),
    retry_index: v.number(),
    event_doc_id: v.optional(v.string()),
};

export const executePendingSubscriptionActivationRetryArgs = {
    ...pendingSubscriptionActivationRetryArgs,
};

export type ExecutePendingSubscriptionActivationRetryArgs = ObjectType<
    typeof executePendingSubscriptionActivationRetryArgs
>;

export const beginSubscriptionStateReconciliationAndScheduleActivationArgs = {
    ...beginSubscriptionStateReconciliationArgs,
    event_doc_id: v.optional(v.string()),
};

export type BeginSubscriptionStateReconciliationAndScheduleActivationArgs = ObjectType<
    typeof beginSubscriptionStateReconciliationAndScheduleActivationArgs
>;

export const beginSubscriptionStateReconciliationAndScheduleUsageRefreshArgs = {
    user_id: v.string(),
    revenuecat_app_user_id: v.string(),
    sync_attempt_id: v.string(),
    now_ms: v.number(),
    lease_duration_ms: v.number(),
};

export type BeginSubscriptionStateReconciliationAndScheduleUsageRefreshArgs = ObjectType<
    typeof beginSubscriptionStateReconciliationAndScheduleUsageRefreshArgs
>;

export const executeSubscriptionUsageRefreshArgs = {
    user_id: v.string(),
    sync_attempt_id: v.string(),
};

export type ExecuteSubscriptionUsageRefreshArgs = ObjectType<
    typeof executeSubscriptionUsageRefreshArgs
>;

export const tickPendingSubscriptionActivationArgs = {
    ...pendingSubscriptionActivationRetryArgs,
};

export type TickPendingSubscriptionActivationArgs = ObjectType<
    typeof tickPendingSubscriptionActivationArgs
>;

export const expirePendingSubscriptionActivationArgs = {
    user_id: v.string(),
    active_signal_at_ms: v.number(),
    event_doc_id: v.optional(v.string()),
};

export type ExpirePendingSubscriptionActivationArgs = ObjectType<
    typeof expirePendingSubscriptionActivationArgs
>;

export const prepareUserAccountDeletionArgs = {
    user_id: v.string(),
};

export type PrepareUserAccountDeletionArgs = ObjectType<
    typeof prepareUserAccountDeletionArgs
>;

export const queueDeletedUserDataCleanupArgs = {
    user_id: v.string(),
};

export type QueueDeletedUserDataCleanupArgs = ObjectType<
    typeof queueDeletedUserDataCleanupArgs
>;

export const finalizeDeletedUserDataArgs = {
    user_id: v.string(),
    mark_auth_deleted: v.optional(v.boolean()),
    allow_terminal_recovery: v.optional(v.boolean()),
    cleanup_fast_retry_attempt: v.optional(v.number()),
};

export type FinalizeDeletedUserDataArgs = ObjectType<
    typeof finalizeDeletedUserDataArgs
>;

export const processQueuedUserDeletionsArgs = {};

export const recoverAuthDeleteDeadLetterUserDeletionsArgs = {};

export const recoverCleanupDeadLetterUserDeletionsArgs = {
    user_id: v.optional(v.string()),
    limit: v.optional(v.number()),
    dry_run: v.optional(v.boolean()),
    retry_immediately: v.optional(v.boolean()),
};

export type RecoverCleanupDeadLetterUserDeletionsArgs = ObjectType<
    typeof recoverCleanupDeadLetterUserDeletionsArgs
>;

export const checkUserDeletionDeadLetterHealthArgs = {};

export const processRevenueCatWebhookEventArgs = {
    // Validate this inside the subscriptions component, not against the app schema.
    event_doc_id: v.string(),
};

export type ProcessRevenueCatWebhookEventArgs = ObjectType<
    typeof processRevenueCatWebhookEventArgs
>;

export const retryRevenueCatWebhookEventsArgs = {};

export const reconcileExpiredSubscriptionStatesArgs = {};

export const purgeExpiredRevenueCatEventsArgs = {};

export const purgeExpiredFrozenQuotaPeriodsArgs = {};

export const checkRevenueCatPipelineHealthArgs = {};
