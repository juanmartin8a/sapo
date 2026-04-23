export type UserDeletionContextLike = {
    has_active_subscription: boolean;
    revenuecat_app_user_id?: string;
    preserved_quota_period_id?: string;
    store_subscription_id?: string;
    store_subscription_period_id?: string;
};

export type UserDeletionCleanupStatus = {
    has_subscription_states: boolean;
    has_quota_periods: boolean;
    has_usage_events: boolean;
    has_revenue_cat_events: boolean;
};

export type UserDeletionFinalizationDecision =
    | {
          status: "use_prepared_context";
          context: UserDeletionContextLike;
      }
    | {
          status: "already_finalized";
      }
    | {
          status: "missing_preparation";
      };

export function isUserDeletionCleanupComplete(status: UserDeletionCleanupStatus) {
    return (
        !status.has_subscription_states &&
        !status.has_quota_periods &&
        !status.has_usage_events &&
        !status.has_revenue_cat_events
    );
}

export function resolveUserDeletionFinalizationDecision(args: {
    preparedDeletionContext: UserDeletionContextLike | null;
    cleanupStatus: UserDeletionCleanupStatus;
}): UserDeletionFinalizationDecision {
    if (args.preparedDeletionContext) {
        return {
            status: "use_prepared_context",
            context: args.preparedDeletionContext,
        };
    }

    if (isUserDeletionCleanupComplete(args.cleanupStatus)) {
        return {
            status: "already_finalized",
        };
    }

    return {
        status: "missing_preparation",
    };
}
