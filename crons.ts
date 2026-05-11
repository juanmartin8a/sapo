import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
    "process queued user deletions",
    { minutes: 1 },
    internal.subscriptionsWorkers.processQueuedUserDeletions,
    {}
);

crons.interval(
    "recover auth-delete dead letters",
    { minutes: 15 },
    internal.subscriptionsWorkers.recoverAuthDeleteDeadLetterUserDeletions,
    {}
);

crons.interval(
    "retry revenuecat webhook events",
    { minutes: 5 },
    internal.subscriptionsWorkers.retryRevenueCatWebhookEvents,
    {}
);

crons.interval(
    "prune stale sapopinguino stream controls",
    { minutes: 15 },
    internal.sapopinguinoWorkers.pruneStaleSapopinguinoStreamControls,
    {}
);

crons.interval(
    "process queued sapopinguino quota recoveries",
    { minutes: 1 },
    internal.sapopinguinoWorkers.processQueuedSapopinguinoQuotaFinalizationRecoveries,
    {}
);

crons.interval(
    "check revenuecat pipeline health",
    { minutes: 30 },
    internal.subscriptionsWorkers.checkRevenueCatPipelineHealth,
    {}
);

crons.interval(
    "reconcile expired subscription states",
    { hours: 12 },
    internal.subscriptionsWorkers.reconcileExpiredSubscriptionStates,
    {}
);

crons.interval(
    "purge expired revenuecat events",
    { hours: 24 },
    internal.subscriptionsWorkers.purgeExpiredRevenueCatEvents,
    {}
);

crons.interval(
    "purge expired frozen quota periods",
    { hours: 24 },
    internal.subscriptionsWorkers.purgeExpiredFrozenQuotaPeriods,
    {}
);

export default crons;
