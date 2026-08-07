import {
    USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS,
    USER_DELETION_CLEANUP_DEAD_LETTER_STATUS,
    USER_DELETION_CLEANUP_STEPS,
    USER_DELETION_LATE_AUTH_WAIT_STATUS,
    USER_DELETION_QUEUE_STATUSES,
} from "../../constants/userDeletion";

export {
    USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS,
    USER_DELETION_CLEANUP_DEAD_LETTER_STATUS,
    USER_DELETION_LATE_AUTH_WAIT_STATUS,
};

export type UserDeletionQueueStatus = (typeof USER_DELETION_QUEUE_STATUSES)[number];
export type UserDeletionCleanupStep = (typeof USER_DELETION_CLEANUP_STEPS)[number];

export type UserDeletionSubscriptionSnapshot<TQuotaPeriodId extends string = string> = {
    has_active_subscription: boolean;
    revenuecat_app_user_id?: string;
    current_quota_period_id?: TQuotaPeriodId;
    store_subscription_id?: string;
    store_subscription_period_id?: string;
};

export type UserDeletionSnapshotForAuthDeletedContext<TQuotaPeriodId extends string = string> =
    UserDeletionSubscriptionSnapshot<TQuotaPeriodId>;

export type UserDeletionQueueContext<TQuotaPeriodId extends string = string> = {
    has_active_subscription: boolean;
    revenuecat_app_user_id?: string;
    preserved_quota_period_id?: TQuotaPeriodId;
    store_subscription_id?: string;
    store_subscription_period_id?: string;
};

export function doesUserDeletionStatusBlockProcessing(
    status?: UserDeletionQueueStatus | null
) {
    return status !== undefined && status !== null;
}

export function doesUserDeletionStatusBlockRevenueCatReconciliation(
    status?: UserDeletionQueueStatus | null
) {
    return status !== undefined && status !== null;
}

export function doesUserDeletionStatusAllowAutomaticRetry(
    status?: UserDeletionQueueStatus | null
) {
    return (
        status !== USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS &&
        status !== USER_DELETION_CLEANUP_DEAD_LETTER_STATUS
    );
}

export function getUserDeletionCleanupLeaseRetryAtMs(args: {
    status?: UserDeletionQueueStatus | null;
    next_retry_at_ms: number;
    cleanup_lease_expires_at_ms?: number | null;
}) {
    if (
        args.status === "cleanup_in_progress" &&
        typeof args.cleanup_lease_expires_at_ms === "number"
    ) {
        return args.cleanup_lease_expires_at_ms;
    }

    return args.next_retry_at_ms;
}

export function doesUserDeletionCleanupAttemptOwnOperation(args: {
    current_cleanup_attempt_id?: string | null;
    cleanup_attempt_id?: string | null;
}) {
    return (
        typeof args.current_cleanup_attempt_id === "string" &&
        args.current_cleanup_attempt_id === args.cleanup_attempt_id
    );
}

export function canAcquireUserDeletionOperation(args: {
    status?: UserDeletionQueueStatus | null;
    next_retry_at_ms: number;
    now_ms: number;
    cleanup_lease_expires_at_ms?: number | null;
    allow_terminal_recovery?: boolean;
}) {
    const allowTerminalRecovery =
        args.allow_terminal_recovery === true &&
        (args.status === USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS ||
            args.status === USER_DELETION_CLEANUP_DEAD_LETTER_STATUS);

    if (allowTerminalRecovery) {
        return true;
    }

    return (
        doesUserDeletionStatusAllowAutomaticRetry(args.status) &&
        getUserDeletionCleanupLeaseRetryAtMs(args) <= args.now_ms
    );
}

export function resolveUserDeletionAuthDeleteWaitStatus(args: {
    elapsed_ms: number;
    confirm_timeout_ms: number;
    dead_letter_timeout_ms: number;
}): Extract<
    UserDeletionQueueStatus,
    | "awaiting_auth_delete"
    | typeof USER_DELETION_LATE_AUTH_WAIT_STATUS
    | typeof USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS
> {
    if (args.elapsed_ms >= args.dead_letter_timeout_ms) {
        return USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS;
    }

    if (args.elapsed_ms >= args.confirm_timeout_ms) {
        return USER_DELETION_LATE_AUTH_WAIT_STATUS;
    }

    return "awaiting_auth_delete";
}

export function resolveUserDeletionQuiescenceStatus(args: {
    active_usage_event_count: number;
    active_revenuecat_event_processing_count: number;
    now_ms: number;
    grace_ends_at_ms: number;
}) {
    const hasActiveWork =
        args.active_usage_event_count > 0 || args.active_revenuecat_event_processing_count > 0;

    if (!hasActiveWork) {
        return "ready" as const;
    }

    return args.now_ms >= args.grace_ends_at_ms ? "overdue" as const : "waiting_for_quiescence" as const;
}

export function shouldDeleteOverdueActiveUsageEvents(args: {
    quiescence_status: ReturnType<typeof resolveUserDeletionQuiescenceStatus>;
    active_usage_event_count: number;
    active_revenuecat_event_processing_count: number;
}) {
    return (
        args.quiescence_status === "overdue" &&
        args.active_usage_event_count > 0 &&
        args.active_revenuecat_event_processing_count === 0
    );
}

export function doesUserDeletionSubscriptionCleanupHaveRemaining(args: {
    remaining_delete_budget: number;
    usage_event_has_more: boolean;
    revenuecat_event_has_more: boolean;
    quota_period_has_more: boolean;
}) {
    return (
        args.remaining_delete_budget <= 0 ||
        args.usage_event_has_more ||
        args.revenuecat_event_has_more ||
        args.quota_period_has_more
    );
}

export function resolveAuthDeletedUserDeletionContext<TQuotaPeriodId extends string>(args: {
    snapshot: UserDeletionSnapshotForAuthDeletedContext<TQuotaPeriodId>;
    existing_context?: Partial<UserDeletionQueueContext<TQuotaPeriodId>> | null;
}): UserDeletionQueueContext<TQuotaPeriodId> {
    const hasActiveSubscription = args.snapshot.has_active_subscription;

    return {
        has_active_subscription: hasActiveSubscription,
        revenuecat_app_user_id:
            args.snapshot.revenuecat_app_user_id ?? args.existing_context?.revenuecat_app_user_id,
        preserved_quota_period_id: hasActiveSubscription
            ? args.snapshot.current_quota_period_id ??
              args.existing_context?.preserved_quota_period_id
            : undefined,
        store_subscription_id:
            args.snapshot.store_subscription_id ?? args.existing_context?.store_subscription_id,
        store_subscription_period_id:
            args.snapshot.store_subscription_period_id ??
            args.existing_context?.store_subscription_period_id,
    };
}

export function resolvePreparedUserDeletionContext<TQuotaPeriodId extends string>(args: {
    snapshot: UserDeletionSubscriptionSnapshot<TQuotaPeriodId>;
    fallback_revenuecat_app_user_id?: string;
}): UserDeletionQueueContext<TQuotaPeriodId> {
    const hasActiveSubscription = args.snapshot.has_active_subscription;

    return {
        has_active_subscription: hasActiveSubscription,
        revenuecat_app_user_id:
            args.snapshot.revenuecat_app_user_id ?? args.fallback_revenuecat_app_user_id,
        preserved_quota_period_id: hasActiveSubscription
            ? args.snapshot.current_quota_period_id
            : undefined,
        store_subscription_id: args.snapshot.store_subscription_id,
        store_subscription_period_id: args.snapshot.store_subscription_period_id,
    };
}

export function hasRequiredPreservedQuotaPeriod(args: {
    has_active_subscription: boolean;
    preserved_quota_period_id?: string | null;
}) {
    return (
        !args.has_active_subscription || typeof args.preserved_quota_period_id === "string"
    );
}

export function getMissingPreservedQuotaPeriodErrorMessage(userId: string) {
    return `Cannot continue paid-user deletion without a preserved quota period for user ${userId}`;
}

export function assertRequiredPreservedQuotaPeriod(args: {
    user_id: string;
    has_active_subscription: boolean;
    preserved_quota_period_id?: string | null;
}) {
    if (!hasRequiredPreservedQuotaPeriod(args)) {
        throw new Error(getMissingPreservedQuotaPeriodErrorMessage(args.user_id));
    }
}
