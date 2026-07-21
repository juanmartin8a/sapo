import { functions } from "./model/webhook";

export const upsertSubscriptionPlanLimits = functions.upsertSubscriptionPlanLimits;
export const reserveSubscriptionQuotaUsage = functions.reserveSubscriptionQuotaUsage;
export const chargeSubscriptionQuotaUsage = functions.chargeSubscriptionQuotaUsage;
export const completeSubscriptionQuotaUsage = functions.completeSubscriptionQuotaUsage;
export const markSubscriptionQuotaUsageFailed = functions.markSubscriptionQuotaUsageFailed;
export const finalizeStaleSubscriptionQuotaUsage =
    functions.finalizeStaleSubscriptionQuotaUsage;
export const ingestRevenueCatEvent = functions.ingestRevenueCatEvent;
export const getRevenueCatEventForProcessing = functions.getRevenueCatEventForProcessing;
export const acquireRevenueCatEventProcessingLeases =
    functions.acquireRevenueCatEventProcessingLeases;
export const getActiveRevenueCatEventProcessingForUserDeletion =
    functions.getActiveRevenueCatEventProcessingForUserDeletion;
export const recordRevenueCatEventProcessingProgress =
    functions.recordRevenueCatEventProcessingProgress;
export const listRetryableRevenueCatEvents = functions.listRetryableRevenueCatEvents;
export const listRevenueCatEventsForStatus = functions.listRevenueCatEventsForStatus;
export const listRevenueCatEventsEligibleForRetentionPurge =
    functions.listRevenueCatEventsEligibleForRetentionPurge;
export const purgeRevenueCatEventsById = functions.purgeRevenueCatEventsById;
export const deleteFrozenQuotaPeriodsEligibleForRetentionPurge =
    functions.deleteFrozenQuotaPeriodsEligibleForRetentionPurge;
export const consumeRefreshRateLimit = functions.consumeRefreshRateLimit;
export const deleteRefreshRateLimitsEligibleForRetentionPurge =
    functions.deleteRefreshRateLimitsEligibleForRetentionPurge;
export const getSubscriptionStateByUserId = functions.getSubscriptionStateByUserId;
export const beginSubscriptionStateReconciliation =
    functions.beginSubscriptionStateReconciliation;
export const releaseSubscriptionStateReconciliation =
    functions.releaseSubscriptionStateReconciliation;
export const getUserDeletionSnapshot = functions.getUserDeletionSnapshot;
export const ensureUserDeletionPreservedQuotaPeriod =
    functions.ensureUserDeletionPreservedQuotaPeriod;
export const getUserDeletionOperationState = functions.getUserDeletionOperationState;
export const listDueUserDeletionOperations = functions.listDueUserDeletionOperations;
export const listAuthDeleteDeadLetterUserDeletionOperations =
    functions.listAuthDeleteDeadLetterUserDeletionOperations;
export const listCleanupDeadLetterUserDeletionOperations =
    functions.listCleanupDeadLetterUserDeletionOperations;
export const getActiveUserDeletionUsageEventCount =
    functions.getActiveUserDeletionUsageEventCount;
export const listSubscriptionStatesDueForExpirationReconciliation =
    functions.listSubscriptionStatesDueForExpirationReconciliation;
export const applyReconciledSubscriptionState = functions.applyReconciledSubscriptionState;
export const startUserDeletionOperation = functions.startUserDeletionOperation;
export const clearUserDeletionOperation = functions.clearUserDeletionOperation;
export const upsertUserDeletionPreparation = functions.upsertUserDeletionPreparation;
export const markUserDeletionAuthDeleted = functions.markUserDeletionAuthDeleted;
export const acquireUserDeletionOperation = functions.acquireUserDeletionOperation;
export const renewUserDeletionOperationCleanupLease =
    functions.renewUserDeletionOperationCleanupLease;
export const rescheduleUserDeletionOperation = functions.rescheduleUserDeletionOperation;
export const deleteUserSubscriptionData = functions.deleteUserSubscriptionData;
export const finalizeDeletedUserSubscriptionData =
    functions.finalizeDeletedUserSubscriptionData;
export const deferSubscriptionStateReconciliation =
    functions.deferSubscriptionStateReconciliation;
