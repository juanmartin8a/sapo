import { internalAction } from "./_generated/server";
import * as Workers from "./model/subscriptions/workers";
import * as WorkerArgs from "./validators/subscriptionsWorkers";

export const refreshSubscriptionStateFromRevenueCat = internalAction({
    args: WorkerArgs.refreshSubscriptionStateFromRevenueCatArgs,
    handler: Workers.refreshSubscriptionStateFromRevenueCatHandler,
});
export const prepareUserAccountDeletion = internalAction({
    args: WorkerArgs.prepareUserAccountDeletionArgs,
    handler: Workers.prepareUserAccountDeletion,
});
export const queueDeletedUserDataCleanup = internalAction({
    args: WorkerArgs.queueDeletedUserDataCleanupArgs,
    handler: Workers.queueDeletedUserDataCleanup,
});
export const finalizeDeletedUserData = internalAction({
    args: WorkerArgs.finalizeDeletedUserDataArgs,
    handler: Workers.finalizeDeletedUserDataHandler,
});
export const processQueuedUserDeletions = internalAction({
    args: WorkerArgs.processQueuedUserDeletionsArgs,
    handler: Workers.processQueuedUserDeletions,
});
export const recoverAuthDeleteDeadLetterUserDeletions = internalAction({
    args: WorkerArgs.recoverAuthDeleteDeadLetterUserDeletionsArgs,
    handler: Workers.recoverAuthDeleteDeadLetterUserDeletions,
});
export const recoverCleanupDeadLetterUserDeletions = internalAction({
    args: WorkerArgs.recoverCleanupDeadLetterUserDeletionsArgs,
    handler: Workers.recoverCleanupDeadLetterUserDeletions,
});
export const checkUserDeletionDeadLetterHealth = internalAction({
    args: WorkerArgs.checkUserDeletionDeadLetterHealthArgs,
    handler: Workers.checkUserDeletionDeadLetterHealth,
});
export const processRevenueCatWebhookEvent = internalAction({
    args: WorkerArgs.processRevenueCatWebhookEventArgs,
    handler: Workers.processRevenueCatWebhookEvent,
});
export const retryRevenueCatWebhookEvents = internalAction({
    args: WorkerArgs.retryRevenueCatWebhookEventsArgs,
    handler: Workers.retryRevenueCatWebhookEvents,
});
export const reconcileExpiredSubscriptionStates = internalAction({
    args: WorkerArgs.reconcileExpiredSubscriptionStatesArgs,
    handler: Workers.reconcileExpiredSubscriptionStates,
});
export const purgeExpiredRevenueCatEvents = internalAction({
    args: WorkerArgs.purgeExpiredRevenueCatEventsArgs,
    handler: Workers.purgeExpiredRevenueCatEvents,
});
export const purgeStaleRefreshRateLimits = internalAction({
    args: WorkerArgs.purgeStaleRefreshRateLimitsArgs,
    handler: Workers.purgeStaleRefreshRateLimits,
});
export const purgeExpiredFrozenQuotaPeriods = internalAction({
    args: WorkerArgs.purgeExpiredFrozenQuotaPeriodsArgs,
    handler: Workers.purgeExpiredFrozenQuotaPeriods,
});
export const checkRevenueCatPipelineHealth = internalAction({
    args: WorkerArgs.checkRevenueCatPipelineHealthArgs,
    handler: Workers.checkRevenueCatPipelineHealth,
});
