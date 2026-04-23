import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

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

export default crons;
