export const USER_DELETION_LATE_AUTH_WAIT_STATUS = "awaiting_auth_delete_late" as const;
export const USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS =
    "auth_delete_dead_letter" as const;

export const userDeletionQueueStatuses = [
    "preparing",
    "awaiting_auth_delete",
    USER_DELETION_LATE_AUTH_WAIT_STATUS,
    USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS,
    "ready_for_cleanup",
    "waiting_for_quiescence",
    "retryable_error",
    "cleanup_in_progress",
] as const;

export type UserDeletionQueueStatus = (typeof userDeletionQueueStatuses)[number];

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
    return status !== USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS;
}

export function canAcquireUserDeletionOperation(args: {
    status?: UserDeletionQueueStatus | null;
    next_retry_at_ms: number;
    now_ms: number;
    allow_terminal_recovery?: boolean;
}) {
    const allowTerminalRecovery =
        args.allow_terminal_recovery === true &&
        args.status === USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS;

    if (allowTerminalRecovery) {
        return true;
    }

    return (
        doesUserDeletionStatusAllowAutomaticRetry(args.status) &&
        args.next_retry_at_ms <= args.now_ms
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
