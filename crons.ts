import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
    "purge retained resend emails",
    { hours: 24 },
    internal.email.cleanupResend,
    {}
);

crons.interval(
    "process queued user deletions",
    { minutes: 15 },
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
    "recover cleanup dead letters",
    { hours: 1 },
    internal.subscriptionsWorkers.recoverCleanupDeadLetterUserDeletions,
    {}
);

crons.interval(
    "retry revenuecat webhook events",
    { minutes: 5 },
    internal.subscriptionsWorkers.retryRevenueCatWebhookEvents,
    {}
);

crons.interval(
    "check revenuecat pipeline health",
    { minutes: 30 },
    internal.subscriptionsWorkers.checkRevenueCatPipelineHealth,
    {}
);

crons.interval(
    "check user deletion dead letters",
    { minutes: 30 },
    internal.subscriptionsWorkers.checkUserDeletionDeadLetterHealth,
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

crons.interval(
    "purge resolved operational alerts",
    { hours: 24 },
    internal.operationalAlerts.purgeResolvedOperationalAlerts,
    {}
);

export default crons;
