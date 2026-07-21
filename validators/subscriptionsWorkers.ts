import { v, type ObjectType } from "convex/values";

export const refreshSubscriptionStateFromRevenueCatArgs = {
    user_id: v.string(),
    force: v.optional(v.boolean()),
    expects_active_subscription: v.optional(v.boolean()),
    active_signal_at_ms: v.optional(v.number()),
};

export type RefreshSubscriptionStateFromRevenueCatArgs = ObjectType<
    typeof refreshSubscriptionStateFromRevenueCatArgs
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

export type ProcessQueuedUserDeletionsArgs = ObjectType<
    typeof processQueuedUserDeletionsArgs
>;

export const recoverAuthDeleteDeadLetterUserDeletionsArgs = {};

export type RecoverAuthDeleteDeadLetterUserDeletionsArgs = ObjectType<
    typeof recoverAuthDeleteDeadLetterUserDeletionsArgs
>;

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

export type CheckUserDeletionDeadLetterHealthArgs = ObjectType<
    typeof checkUserDeletionDeadLetterHealthArgs
>;

export const processRevenueCatWebhookEventArgs = {
    // Validate this inside the subscriptions component, not against the app schema.
    event_doc_id: v.string(),
};

export type ProcessRevenueCatWebhookEventArgs = ObjectType<
    typeof processRevenueCatWebhookEventArgs
>;

export const retryRevenueCatWebhookEventsArgs = {};

export type RetryRevenueCatWebhookEventsArgs = ObjectType<
    typeof retryRevenueCatWebhookEventsArgs
>;

export const reconcileExpiredSubscriptionStatesArgs = {};

export type ReconcileExpiredSubscriptionStatesArgs = ObjectType<
    typeof reconcileExpiredSubscriptionStatesArgs
>;

export const purgeExpiredRevenueCatEventsArgs = {};

export type PurgeExpiredRevenueCatEventsArgs = ObjectType<
    typeof purgeExpiredRevenueCatEventsArgs
>;

export const purgeStaleRefreshRateLimitsArgs = {};

export type PurgeStaleRefreshRateLimitsArgs = ObjectType<
    typeof purgeStaleRefreshRateLimitsArgs
>;

export const purgeExpiredFrozenQuotaPeriodsArgs = {};

export type PurgeExpiredFrozenQuotaPeriodsArgs = ObjectType<
    typeof purgeExpiredFrozenQuotaPeriodsArgs
>;

export const checkRevenueCatPipelineHealthArgs = {};

export type CheckRevenueCatPipelineHealthArgs = ObjectType<
    typeof checkRevenueCatPipelineHealthArgs
>;
