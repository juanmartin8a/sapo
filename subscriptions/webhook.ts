import { mutation, internalMutation, query } from "./_generated/server";
import * as Webhook from "./model/webhook";
import * as WebhookArgs from "./validators/webhook";

export const reserveSubscriptionQuotaUsage = mutation({
    args: WebhookArgs.reserveSubscriptionQuotaUsageArgs,
    handler: Webhook.reserveSubscriptionQuotaUsage,
});
export const chargeSubscriptionQuotaUsage = mutation({
    args: WebhookArgs.chargeSubscriptionQuotaUsageArgs,
    handler: Webhook.chargeSubscriptionQuotaUsage,
});
export const completeSubscriptionQuotaUsage = mutation({
    args: WebhookArgs.completeSubscriptionQuotaUsageArgs,
    handler: Webhook.completeSubscriptionQuotaUsage,
});
export const markSubscriptionQuotaUsageFailed = mutation({
    args: WebhookArgs.markSubscriptionQuotaUsageFailedArgs,
    handler: Webhook.markSubscriptionQuotaUsageFailed,
});
export const finalizeStaleSubscriptionQuotaUsage = internalMutation({
    args: WebhookArgs.finalizeStaleSubscriptionQuotaUsageArgs,
    handler: Webhook.finalizeStaleSubscriptionQuotaUsage,
});
export const ingestRevenueCatEvent = mutation({
    args: WebhookArgs.ingestRevenueCatEventArgs,
    handler: Webhook.ingestRevenueCatEvent,
});
export const getRevenueCatEventForProcessing = query({
    args: WebhookArgs.getRevenueCatEventForProcessingArgs,
    handler: Webhook.getRevenueCatEventForProcessing,
});
export const acquireRevenueCatEventProcessingLeases = mutation({
    args: WebhookArgs.acquireRevenueCatEventProcessingLeasesArgs,
    handler: Webhook.acquireRevenueCatEventProcessingLeases,
});
export const getActiveRevenueCatEventProcessingForUserDeletion = query({
    args: WebhookArgs.getActiveRevenueCatEventProcessingForUserDeletionArgs,
    handler: Webhook.getActiveRevenueCatEventProcessingForUserDeletion,
});
export const recordRevenueCatEventProcessingProgress = mutation({
    args: WebhookArgs.recordRevenueCatEventProcessingProgressArgs,
    handler: Webhook.recordRevenueCatEventProcessingProgress,
});
export const listRetryableRevenueCatEvents = query({
    args: WebhookArgs.listRetryableRevenueCatEventsArgs,
    handler: Webhook.listRetryableRevenueCatEvents,
});
export const listRevenueCatEventsForStatus = query({
    args: WebhookArgs.listRevenueCatEventsForStatusArgs,
    handler: Webhook.listRevenueCatEventsForStatus,
});
export const listRevenueCatEventsEligibleForRetentionPurge = query({
    args: WebhookArgs.listRevenueCatEventsEligibleForRetentionPurgeArgs,
    handler: Webhook.listRevenueCatEventsEligibleForRetentionPurge,
});
export const purgeRevenueCatEventsById = mutation({
    args: WebhookArgs.purgeRevenueCatEventsByIdArgs,
    handler: Webhook.purgeRevenueCatEventsById,
});
export const deleteFrozenQuotaPeriodsEligibleForRetentionPurge = mutation({
    args: WebhookArgs.deleteFrozenQuotaPeriodsEligibleForRetentionPurgeArgs,
    handler: Webhook.deleteFrozenQuotaPeriodsEligibleForRetentionPurge,
});
export const getSubscriptionStateByUserId = query({
    args: WebhookArgs.getSubscriptionStateByUserIdArgs,
    handler: Webhook.getSubscriptionStateByUserId,
});
export const beginSubscriptionStateReconciliation = mutation({
    args: WebhookArgs.beginSubscriptionStateReconciliationArgs,
    handler: Webhook.beginSubscriptionStateReconciliation,
});
export const claimPendingActiveRetry = mutation({
    args: WebhookArgs.claimPendingActiveRetryArgs,
    handler: Webhook.claimPendingActiveRetry,
});
export const expirePendingActiveSignal = mutation({
    args: WebhookArgs.expirePendingActiveSignalArgs,
    handler: Webhook.expirePendingActiveSignal,
});
export const releaseSubscriptionStateReconciliation = mutation({
    args: WebhookArgs.releaseSubscriptionStateReconciliationArgs,
    handler: Webhook.releaseSubscriptionStateReconciliation,
});
export const getUserDeletionSnapshot = query({
    args: WebhookArgs.getUserDeletionSnapshotArgs,
    handler: Webhook.getUserDeletionSnapshot,
});
export const ensureUserDeletionPreservedQuotaPeriod = mutation({
    args: WebhookArgs.ensureUserDeletionPreservedQuotaPeriodArgs,
    handler: Webhook.ensureUserDeletionPreservedQuotaPeriod,
});
export const getUserDeletionOperationState = query({
    args: WebhookArgs.getUserDeletionOperationStateArgs,
    handler: Webhook.getUserDeletionOperationState,
});
export const listDueUserDeletionOperations = query({
    args: WebhookArgs.listDueUserDeletionOperationsArgs,
    handler: Webhook.listDueUserDeletionOperations,
});
export const listAuthDeleteDeadLetterUserDeletionOperations = query({
    args: WebhookArgs.listAuthDeleteDeadLetterUserDeletionOperationsArgs,
    handler: Webhook.listAuthDeleteDeadLetterUserDeletionOperations,
});
export const listCleanupDeadLetterUserDeletionOperations = query({
    args: WebhookArgs.listCleanupDeadLetterUserDeletionOperationsArgs,
    handler: Webhook.listCleanupDeadLetterUserDeletionOperations,
});
export const getActiveUserDeletionUsageEventCount = query({
    args: WebhookArgs.getActiveUserDeletionUsageEventCountArgs,
    handler: Webhook.getActiveUserDeletionUsageEventCount,
});
export const listSubscriptionStatesDueForExpirationReconciliation = query({
    args: WebhookArgs.listSubscriptionStatesDueForExpirationReconciliationArgs,
    handler: Webhook.listSubscriptionStatesDueForExpirationReconciliation,
});
export const applyReconciledSubscriptionState = mutation({
    args: WebhookArgs.applyReconciledSubscriptionStateArgs,
    handler: Webhook.applyReconciledSubscriptionState,
});
export const startUserDeletionOperation = mutation({
    args: WebhookArgs.startUserDeletionOperationArgs,
    handler: Webhook.startUserDeletionOperation,
});
export const clearUserDeletionOperation = mutation({
    args: WebhookArgs.clearUserDeletionOperationArgs,
    handler: Webhook.clearUserDeletionOperation,
});
export const upsertUserDeletionPreparation = mutation({
    args: WebhookArgs.upsertUserDeletionPreparationArgs,
    handler: Webhook.upsertUserDeletionPreparation,
});
export const markUserDeletionAuthDeleted = mutation({
    args: WebhookArgs.markUserDeletionAuthDeletedArgs,
    handler: Webhook.markUserDeletionAuthDeleted,
});
export const acquireUserDeletionOperation = mutation({
    args: WebhookArgs.acquireUserDeletionOperationArgs,
    handler: Webhook.acquireUserDeletionOperation,
});
export const renewUserDeletionOperationCleanupLease = mutation({
    args: WebhookArgs.renewUserDeletionOperationCleanupLeaseArgs,
    handler: Webhook.renewUserDeletionOperationCleanupLease,
});
export const rescheduleUserDeletionOperation = mutation({
    args: WebhookArgs.rescheduleUserDeletionOperationArgs,
    handler: Webhook.rescheduleUserDeletionOperation,
});
export const deleteUserSubscriptionData = mutation({
    args: WebhookArgs.deleteUserSubscriptionDataArgs,
    handler: Webhook.deleteUserSubscriptionData,
});
export const finalizeDeletedUserSubscriptionData = mutation({
    args: WebhookArgs.finalizeDeletedUserSubscriptionDataArgs,
    handler: Webhook.finalizeDeletedUserSubscriptionData,
});
export const deferSubscriptionStateReconciliation = mutation({
    args: WebhookArgs.deferSubscriptionStateReconciliationArgs,
    handler: Webhook.deferSubscriptionStateReconciliation,
});
