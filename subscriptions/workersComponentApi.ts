import { components } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { UserDeletionQueueStatus } from "../userDeletionQueue";

export type SubscriptionStateReconciliationCtx = Pick<ActionCtx, "runQuery" | "runMutation">;

export type UserDeletionSnapshot = {
    has_active_subscription: boolean;
    revenuecat_app_user_id?: string;
    current_quota_period_id?: string;
    store_subscription_id?: string;
    store_subscription_period_id?: string;
};

export type UserDeletionOperationState = {
    in_progress: boolean;
    blocks_processing?: boolean;
    blocks_revenuecat_reconciliation?: boolean;
    status?: UserDeletionQueueStatus;
    started_at_ms?: number;
    prepared_at_ms?: number;
    auth_deleted_at_ms?: number;
    next_retry_at_ms?: number;
    retry_count?: number;
    force_stop_after_at_ms?: number;
    updated_at_ms?: number;
    revenuecat_app_user_id?: string;
    has_active_subscription?: boolean;
    preserved_quota_period_id?: string;
    store_subscription_id?: string;
    store_subscription_period_id?: string;
};

export type RevenueCatWebhookEventForProcessing = {
    event_id: string;
    event_type: string;
    status: "pending" | "failed" | "processed" | "ignored" | "dead_letter";
    user_id?: string;
    transaction_id?: string;
    target_user_ids: string[];
    pending_user_ids: string[];
    processed_user_ids: string[];
    ignored_user_ids: string[];
};

export type RevenueCatEventProgressMutationResult = {
    status: "missing" | "pending" | "failed" | "processed" | "ignored" | "dead_letter";
    pending_user_ids?: string[];
    processed_user_ids?: string[];
    ignored_user_ids?: string[];
};

export type RevenueCatEventProcessingLeaseAcquisitionResult = {
    status: "missing" | "pending" | "failed" | "processed" | "ignored" | "dead_letter";
    acquired_user_ids: string[];
    active_processing_user_ids: string[];
    blocked_user_ids: string[];
};

export async function recordRevenueCatEventProcessingProgress(
    ctx: SubscriptionStateReconciliationCtx,
    args: {
        event_doc_id: string;
        now_ms: number;
        processed_user_ids: string[];
        ignored_user_ids: string[];
        released_user_ids?: string[];
        status_message?: string;
        next_retry_at_ms?: number;
        error_message?: string;
        retry_config?: {
            max_retry_count: number;
            retry_base_delay_ms: number;
            retry_max_delay_ms: number;
        };
    }
) {
    return (await ctx.runMutation(
        components.subscriptions.webhook.recordRevenueCatEventProcessingProgress,
        args
    )) as RevenueCatEventProgressMutationResult;
}

export async function acquireRevenueCatEventProcessingLeases(
    ctx: SubscriptionStateReconciliationCtx,
    args: {
        event_doc_id: string;
        user_ids: string[];
        now_ms: number;
        lease_duration_ms: number;
    }
) {
    return (await (ctx as any).runMutation(
        (components.subscriptions.webhook as Record<string, unknown>)
            .acquireRevenueCatEventProcessingLeases,
        {
            event_doc_id: args.event_doc_id,
            user_ids: args.user_ids,
            now_ms: args.now_ms,
            lease_expires_at_ms: args.now_ms + args.lease_duration_ms,
        }
    )) as RevenueCatEventProcessingLeaseAcquisitionResult;
}

export async function getBetterAuthUserCreatedAtMs(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string
) {
    const user = (await (ctx as any).runQuery(components.betterAuth.adapter.findOne, {
        model: "user",
        where: [{ field: "_id", value: userId }],
    })) as { createdAt?: number } | null;

    return {
        exists: user !== null,
        created_at_ms: typeof user?.createdAt === "number" ? user.createdAt : undefined,
    };
}

export async function getUserDeletionSnapshotByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string
) {
    return (await (ctx as any).runQuery(components.subscriptions.webhook.getUserDeletionSnapshot, {
        user_id: userId,
    })) as UserDeletionSnapshot;
}

export async function getUserDeletionOperationStateByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string
) {
    return (await (ctx as any).runQuery(
        (components.subscriptions.webhook as Record<string, unknown>).getUserDeletionOperationState,
        {
            user_id: userId,
        }
    )) as UserDeletionOperationState;
}

export async function startUserDeletionOperationByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string,
    nowMs: number
) {
    return (await (ctx as any).runMutation(
        (components.subscriptions.webhook as Record<string, unknown>).startUserDeletionOperation,
        {
            user_id: userId,
            now_ms: nowMs,
        }
    )) as {
        in_progress: boolean;
        started_at_ms: number;
        updated_at_ms: number;
    };
}

export async function clearUserDeletionOperationByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string
) {
    return (await (ctx as any).runMutation(
        (components.subscriptions.webhook as Record<string, unknown>).clearUserDeletionOperation,
        {
            user_id: userId,
        }
    )) as {
        deleted_count: number;
    };
}

export async function markUserDeletionAuthDeletedByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string,
    args: {
        now_ms: number;
        force_stop_after_at_ms: number;
    }
) {
    return (await (ctx as any).runMutation(
        (components.subscriptions.webhook as Record<string, unknown>).markUserDeletionAuthDeleted,
        {
            user_id: userId,
            now_ms: args.now_ms,
            force_stop_after_at_ms: args.force_stop_after_at_ms,
        }
    )) as {
        updated: boolean;
        auth_deleted_at_ms?: number;
        next_retry_at_ms?: number;
        status?: UserDeletionQueueStatus;
    };
}

export async function listDueUserDeletionOperationUserIds(
    ctx: SubscriptionStateReconciliationCtx,
    args: {
        now_ms: number;
        limit: number;
    }
) {
    return (await (ctx as any).runQuery(
        (components.subscriptions.webhook as Record<string, unknown>).listDueUserDeletionOperations,
        args
    )) as {
        user_id: string;
        status: UserDeletionQueueStatus;
        next_retry_at_ms: number;
    }[];
}

export async function listAuthDeleteDeadLetterUserDeletionOperationUserIds(
    ctx: SubscriptionStateReconciliationCtx,
    args: {
        limit: number;
    }
) {
    return (await (ctx as any).runQuery(
        (components.subscriptions.webhook as Record<string, unknown>)
            .listAuthDeleteDeadLetterUserDeletionOperations,
        args
    )) as {
        user_id: string;
        status: UserDeletionQueueStatus;
        updated_at_ms: number;
    }[];
}

export async function acquireUserDeletionOperationByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string,
    args: {
        now_ms: number;
        lease_expires_at_ms: number;
        allow_terminal_recovery?: boolean;
    }
) {
    return (await (ctx as any).runMutation(
        (components.subscriptions.webhook as Record<string, unknown>).acquireUserDeletionOperation,
        {
            user_id: userId,
            now_ms: args.now_ms,
            lease_expires_at_ms: args.lease_expires_at_ms,
            ...(args.allow_terminal_recovery === true
                ? { allow_terminal_recovery: true }
                : {}),
        }
    )) as
        | {
              acquired: true;
              missing: false;
              operation: Omit<UserDeletionOperationState, "in_progress"> & {
                  user_id: string;
                  status: UserDeletionQueueStatus;
                  started_at_ms: number;
                  next_retry_at_ms: number;
                  retry_count: number;
                  updated_at_ms: number;
              };
          }
        | {
              acquired: false;
              missing: boolean;
              status?: UserDeletionQueueStatus;
              next_retry_at_ms?: number;
          };
}

export async function rescheduleUserDeletionOperationByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string,
    args: {
        status: UserDeletionQueueStatus;
        now_ms: number;
        next_retry_at_ms: number;
        retry_count_increment?: number;
        last_error?: string | null;
        auth_deleted_at_ms?: number;
        force_stop_after_at_ms?: number;
    }
) {
    return (await (ctx as any).runMutation(
        (components.subscriptions.webhook as Record<string, unknown>).rescheduleUserDeletionOperation,
        {
            user_id: userId,
            status: args.status,
            now_ms: args.now_ms,
            next_retry_at_ms: args.next_retry_at_ms,
            ...(typeof args.retry_count_increment === "number"
                ? { retry_count_increment: args.retry_count_increment }
                : {}),
            ...(typeof args.last_error === "string" || args.last_error === null
                ? { last_error: args.last_error }
                : {}),
            ...(typeof args.auth_deleted_at_ms === "number"
                ? { auth_deleted_at_ms: args.auth_deleted_at_ms }
                : {}),
            ...(typeof args.force_stop_after_at_ms === "number"
                ? { force_stop_after_at_ms: args.force_stop_after_at_ms }
                : {}),
        }
    )) as {
        updated: boolean;
        status?: UserDeletionQueueStatus;
        next_retry_at_ms?: number;
        retry_count?: number;
    };
}

export async function getActiveUserDeletionUsageEventCountByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string
) {
    return (await (ctx as any).runQuery(
        (components.subscriptions.webhook as Record<string, unknown>)
            .getActiveUserDeletionUsageEventCount,
        {
            user_id: userId,
        }
    )) as {
        active_usage_event_count: number;
    };
}

export async function getUserStreamControlQuiescenceByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string,
    nowMs: number
) {
    return (await (ctx as any).runQuery(
        (components.sapopinguino.streamControl as Record<string, unknown>)
            .getUserStreamControlQuiescence,
        {
            userId,
            nowMs,
        }
    )) as {
        total_stream_control_count: number;
        live_stream_control_count: number;
        orphaned_stream_control_count: number;
    };
}

export async function forceStopActiveUserUsageEventsByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string,
    nowMs: number
) {
    return (await (ctx as any).runMutation(
        (components.subscriptions.webhook as Record<string, unknown>).forceStopUserActiveUsageEvents,
        {
            user_id: userId,
            now_ms: nowMs,
        }
    )) as {
        forced_stop_count: number;
        active_usage_event_count: number;
    };
}

export async function forceStopUserStreamControlsByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string
) {
    return (await ctx.runMutation(components.sapopinguino.streamControl.deleteUserStreamControls, {
        userId,
    })) as {
        deleted_count: number;
    };
}
