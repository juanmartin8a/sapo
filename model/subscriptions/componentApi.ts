import { components } from "../../_generated/api";
import type { SubscriptionPlanKey } from "../../constants/subscriptions";
import type { ActionCtx } from "../../_generated/server";
import type { UserDeletionCleanupStep, UserDeletionQueueStatus } from "./userDeletionQueue";

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
    revenuecat_deleted_at_ms?: number;
    next_retry_at_ms?: number;
    retry_count?: number;
    cleanup_attempt_id?: string;
    cleanup_step?: UserDeletionCleanupStep;
    cleanup_step_started_at_ms?: number;
    cleanup_lease_expires_at_ms?: number;
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
    event_at_ms: number;
    status: "pending" | "failed" | "processed" | "ignored" | "dead_letter";
    user_id?: string;
    transaction_id?: string;
    target_user_ids: string[];
    pending_user_ids: string[];
    processed_user_ids: string[];
    ignored_user_ids: string[];
};

export type SubscriptionStateReconciliationLeaseResult =
    | {
          status: "acquired";
          revenuecat_app_user_id: string;
          has_active_subscription: boolean;
          plan_key: SubscriptionPlanKey;
          last_synced_at_ms: number;
          billing_cycle_end_at_ms?: number;
      }
    | {
          status: "in_progress";
          revenuecat_app_user_id: string;
          has_active_subscription: boolean;
          plan_key: SubscriptionPlanKey;
          last_synced_at_ms: number;
          billing_cycle_end_at_ms?: number;
          retry_at_ms?: number;
      };

export type RevenueCatEventProgressMutationResult = {
    status: "missing" | "pending" | "failed" | "processed" | "ignored" | "dead_letter";
    pending_user_ids?: string[];
    processed_user_ids?: string[];
    ignored_user_ids?: string[];
    owner_mismatch?: boolean;
    lease_expired?: boolean;
    ownership_failure?: string;
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
        processing_attempt_id?: string;
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
        processing_attempt_id: string;
        lease_duration_ms: number;
    }
) {
    return (await (ctx as any).runMutation(
        (components.subscriptions.webhook as Record<string, unknown>)
            .acquireRevenueCatEventProcessingLeases,
        {
            event_doc_id: args.event_doc_id,
            user_ids: args.user_ids,
            processing_attempt_id: args.processing_attempt_id,
            lease_duration_ms: args.lease_duration_ms,
        }
    )) as RevenueCatEventProcessingLeaseAcquisitionResult;
}

export async function beginSubscriptionStateReconciliation(
    ctx: SubscriptionStateReconciliationCtx,
    args: {
        user_id: string;
        revenuecat_app_user_id: string;
        signup_at_ms?: number;
        sync_attempt_id: string;
        now_ms: number;
        lease_duration_ms: number;
        expects_active_subscription?: boolean;
        trusted_active_signal?: boolean;
        active_signal_at_ms?: number;
        active_signal_ttl_ms?: number;
    }
) {
    return (await (ctx as any).runMutation(
        (components.subscriptions.webhook as Record<string, unknown>)
            .beginSubscriptionStateReconciliation,
        args
    )) as SubscriptionStateReconciliationLeaseResult;
}

export async function releaseSubscriptionStateReconciliation(
    ctx: SubscriptionStateReconciliationCtx,
    args: {
        user_id: string;
        sync_attempt_id: string;
        now_ms: number;
        next_attempt_at_ms?: number;
    }
) {
    return (await (ctx as any).runMutation(
        (components.subscriptions.webhook as Record<string, unknown>)
            .releaseSubscriptionStateReconciliation,
        args
    )) as {
        status: "released" | "not_owner" | "missing";
        owner_mismatch?: boolean;
        lease_expired?: boolean;
        ownership_failure?: string | null;
    };
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
    userId: string,
    args?: {
        cleanup_attempt_id?: string;
        now_ms?: number;
    }
) {
    return (await (ctx as any).runMutation(
        (components.subscriptions.webhook as Record<string, unknown>).clearUserDeletionOperation,
        {
            user_id: userId,
            ...(typeof args?.cleanup_attempt_id === "string"
                ? { cleanup_attempt_id: args.cleanup_attempt_id }
                : {}),
            ...(typeof args?.now_ms === "number" ? { now_ms: args.now_ms } : {}),
        }
    )) as {
        deleted_count: number;
        owner_mismatch?: boolean;
        lease_expired?: boolean;
        ownership_failure?: string;
    };
}

export async function markUserDeletionAuthDeletedByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string,
    args: {
        now_ms: number;
    }
) {
    return (await (ctx as any).runMutation(
        (components.subscriptions.webhook as Record<string, unknown>).markUserDeletionAuthDeleted,
        {
            user_id: userId,
            now_ms: args.now_ms,
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

export async function listCleanupDeadLetterUserDeletionOperationUserIds(
    ctx: SubscriptionStateReconciliationCtx,
    args: {
        limit: number;
        now_ms?: number;
        user_id?: string;
    }
) {
    return (await (ctx as any).runQuery(
        (components.subscriptions.webhook as Record<string, unknown>)
            .listCleanupDeadLetterUserDeletionOperations,
        args
    )) as {
        user_id: string;
        status: UserDeletionQueueStatus;
        retry_count: number;
        next_retry_at_ms: number;
        last_error?: string;
        updated_at_ms: number;
    }[];
}

export async function acquireUserDeletionOperationByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string,
    args: {
        now_ms: number;
        lease_expires_at_ms: number;
        cleanup_attempt_id: string;
        cleanup_step?: UserDeletionCleanupStep;
        allow_terminal_recovery?: boolean;
    }
) {
    return (await (ctx as any).runMutation(
        (components.subscriptions.webhook as Record<string, unknown>).acquireUserDeletionOperation,
        {
            user_id: userId,
            now_ms: args.now_ms,
            lease_expires_at_ms: args.lease_expires_at_ms,
            cleanup_attempt_id: args.cleanup_attempt_id,
            ...(args.cleanup_step ? { cleanup_step: args.cleanup_step } : {}),
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
                  cleanup_attempt_id?: string;
                  cleanup_step?: UserDeletionCleanupStep;
                  cleanup_step_started_at_ms?: number;
                  cleanup_lease_expires_at_ms?: number;
              };
          }
        | {
              acquired: false;
              missing: boolean;
              status?: UserDeletionQueueStatus;
              next_retry_at_ms?: number;
          };
}

export async function renewUserDeletionOperationCleanupLeaseByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string,
    args: {
        cleanup_attempt_id: string;
        cleanup_step: UserDeletionCleanupStep;
        now_ms: number;
        lease_expires_at_ms: number;
    }
) {
    return (await (ctx as any).runMutation(
        (components.subscriptions.webhook as Record<string, unknown>)
            .renewUserDeletionOperationCleanupLease,
        {
            user_id: userId,
            cleanup_attempt_id: args.cleanup_attempt_id,
            cleanup_step: args.cleanup_step,
            now_ms: args.now_ms,
            lease_expires_at_ms: args.lease_expires_at_ms,
        }
    )) as
        | {
              renewed: true;
              status: UserDeletionQueueStatus;
              next_retry_at_ms: number;
              cleanup_step?: UserDeletionCleanupStep;
              cleanup_step_started_at_ms?: number;
              cleanup_lease_expires_at_ms?: number;
          }
        | {
              renewed: false;
              missing?: boolean;
              owner_mismatch?: boolean;
              lease_expired?: boolean;
              ownership_failure?: string;
              status?: UserDeletionQueueStatus;
              next_retry_at_ms?: number;
              cleanup_lease_expires_at_ms?: number;
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
        revenuecat_deleted_at_ms?: number;
        cleanup_attempt_id?: string;
        cleanup_step?: UserDeletionCleanupStep;
        cleanup_lease_expires_at_ms?: number;
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
            ...(typeof args.revenuecat_deleted_at_ms === "number"
                ? { revenuecat_deleted_at_ms: args.revenuecat_deleted_at_ms }
                : {}),
            ...(typeof args.cleanup_attempt_id === "string"
                ? { cleanup_attempt_id: args.cleanup_attempt_id }
                : {}),
            ...(args.cleanup_step ? { cleanup_step: args.cleanup_step } : {}),
            ...(typeof args.cleanup_lease_expires_at_ms === "number"
                ? { cleanup_lease_expires_at_ms: args.cleanup_lease_expires_at_ms }
                : {}),
        }
    )) as {
        updated: boolean;
        status?: UserDeletionQueueStatus;
        next_retry_at_ms?: number;
        retry_count?: number;
        owner_mismatch?: boolean;
        lease_expired?: boolean;
        ownership_failure?: string;
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

export async function getActiveRevenueCatEventProcessingForUserDeletionByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string,
    nowMs: number,
    limit: number
) {
    return (await (ctx as any).runQuery(
        (components.subscriptions.webhook as Record<string, unknown>)
            .getActiveRevenueCatEventProcessingForUserDeletion,
        {
            user_id: userId,
            now_ms: nowMs,
            limit,
        }
    )) as {
        active_processing_count: number;
        has_more: boolean;
        processing_expires_at_ms?: number;
    };
}
