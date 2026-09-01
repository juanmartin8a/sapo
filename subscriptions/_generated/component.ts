/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    webhook: {
      acquireRevenueCatEventProcessingLeases: FunctionReference<
        "mutation",
        "internal",
        {
          event_doc_id: string;
          lease_duration_ms: number;
          processing_attempt_id: string;
          user_ids: Array<string>;
        },
        any,
        Name
      >;
      acquireUserDeletionOperation: FunctionReference<
        "mutation",
        "internal",
        {
          allow_terminal_recovery?: boolean;
          cleanup_attempt_id: string;
          cleanup_step?:
            | "acquired"
            | "waiting_for_quiescence"
            | "deleting_subscription_data"
            | "finalizing_subscription_data"
            | "deleting_revenuecat_subscriber";
          lease_expires_at_ms: number;
          now_ms: number;
          user_id: string;
        },
        any,
        Name
      >;
      applyReconciledSubscriptionState: FunctionReference<
        "mutation",
        "internal",
        {
          active_signal_at_ms?: number;
          active_signal_ttl_ms?: number;
          allow_user_deletion_in_progress?: boolean;
          clear_pending_active_signal?: boolean;
          expects_active_subscription?: boolean;
          revenuecat_app_user_id: string;
          revenuecat_event_at_ms?: number;
          revenuecat_event_id?: string;
          signup_at_ms?: number;
          snapshot: {
            access_expires_at_ms?: number;
            entitlement_id?: string;
            environment?: string;
            has_active_subscription: boolean;
            period_end_at_ms?: number;
            period_start_at_ms?: number;
            product_id?: string;
            store?: string;
            store_subscription_id?: string;
          };
          store_subscription_id_hint?: string;
          sync_attempt_id: string;
          synced_at_ms: number;
          trusted_active_signal?: boolean;
          user_id: string;
        },
        any,
        Name
      >;
      beginSubscriptionStateReconciliation: FunctionReference<
        "mutation",
        "internal",
        {
          active_signal_at_ms?: number;
          active_signal_ttl_ms?: number;
          clear_pending_active_signal?: boolean;
          client_reconciliation?: boolean;
          expects_active_subscription?: boolean;
          lease_duration_ms: number;
          now_ms: number;
          revenuecat_app_user_id: string;
          revenuecat_event_at_ms?: number;
          signup_at_ms?: number;
          sync_attempt_id: string;
          trusted_active_signal?: boolean;
          user_id: string;
        },
        any,
        Name
      >;
      chargeSubscriptionQuotaUsage: FunctionReference<
        "mutation",
        "internal",
        { now_ms: number; usage_event_id: string },
        any,
        Name
      >;
      claimPendingActiveRetry: FunctionReference<
        "mutation",
        "internal",
        {
          active_signal_at_ms: number;
          next_retry_at_ms: number;
          now_ms: number;
          retry_index: number;
          user_id: string;
        },
        any,
        Name
      >;
      clearUserDeletionOperation: FunctionReference<
        "mutation",
        "internal",
        { cleanup_attempt_id?: string; now_ms?: number; user_id: string },
        any,
        Name
      >;
      completeSubscriptionQuotaUsage: FunctionReference<
        "mutation",
        "internal",
        { now_ms: number; usage_event_id: string },
        any,
        Name
      >;
      deferSubscriptionStateReconciliation: FunctionReference<
        "mutation",
        "internal",
        {
          expected_last_synced_at_ms: number;
          next_attempt_at_ms: number;
          user_id: string;
        },
        any,
        Name
      >;
      deleteFrozenQuotaPeriodsEligibleForRetentionPurge: FunctionReference<
        "mutation",
        "internal",
        { limit: number; older_than_ms: number },
        any,
        Name
      >;
      deleteUserSubscriptionData: FunctionReference<
        "mutation",
        "internal",
        {
          now_ms: number;
          preserved_quota_period_id?: string;
          revenuecat_app_user_id?: string;
          user_id: string;
        },
        any,
        Name
      >;
      ensureUserDeletionPreservedQuotaPeriod: FunctionReference<
        "mutation",
        "internal",
        { now_ms: number; user_id: string },
        any,
        Name
      >;
      expirePendingActiveSignal: FunctionReference<
        "mutation",
        "internal",
        { active_signal_at_ms: number; now_ms: number; user_id: string },
        any,
        Name
      >;
      finalizeDeletedUserSubscriptionData: FunctionReference<
        "mutation",
        "internal",
        {
          has_active_subscription: boolean;
          now_ms: number;
          preserved_quota_period_id?: string;
          revenuecat_app_user_id?: string;
          store_subscription_id?: string;
          store_subscription_period_id?: string;
          user_id: string;
        },
        any,
        Name
      >;
      getActiveRevenueCatEventProcessingForUserDeletion: FunctionReference<
        "query",
        "internal",
        { limit: number; now_ms: number; user_id: string },
        any,
        Name
      >;
      getActiveUserDeletionUsageEventCount: FunctionReference<
        "query",
        "internal",
        { user_id: string },
        any,
        Name
      >;
      getRevenueCatEventForProcessing: FunctionReference<
        "query",
        "internal",
        { event_doc_id: string },
        any,
        Name
      >;
      getSubscriptionStateByUserId: FunctionReference<
        "query",
        "internal",
        { user_id: string },
        any,
        Name
      >;
      getUserDeletionOperationState: FunctionReference<
        "query",
        "internal",
        { user_id: string },
        any,
        Name
      >;
      getUserDeletionSnapshot: FunctionReference<
        "query",
        "internal",
        { user_id: string },
        any,
        Name
      >;
      ingestRevenueCatEvent: FunctionReference<
        "mutation",
        "internal",
        {
          normalized_event: {
            aliases: Array<string>;
            app_user_id?: string;
            entitlement_ids: Array<string>;
            environment?: string;
            event_at_ms: number;
            event_id: string;
            event_type: string;
            expiration_at_ms?: number;
            grace_period_expiration_at_ms?: number;
            original_app_user_id?: string;
            product_id?: string;
            purchased_at_ms?: number;
            store?: string;
            transaction_id?: string;
            transferred_from: Array<string>;
            transferred_to: Array<string>;
            user_id?: string;
          };
          raw_payload?: string;
          received_at_ms: number;
        },
        any,
        Name
      >;
      listAuthDeleteDeadLetterUserDeletionOperations: FunctionReference<
        "query",
        "internal",
        { limit: number },
        any,
        Name
      >;
      listCleanupDeadLetterUserDeletionOperations: FunctionReference<
        "query",
        "internal",
        { limit: number; now_ms?: number; user_id?: string },
        any,
        Name
      >;
      listDueUserDeletionOperations: FunctionReference<
        "query",
        "internal",
        { limit: number; now_ms: number },
        any,
        Name
      >;
      listRetryableRevenueCatEvents: FunctionReference<
        "query",
        "internal",
        {
          limit: number;
          now_ms: number;
          status:
            | "pending"
            | "failed"
            | "processed"
            | "ignored"
            | "dead_letter";
        },
        any,
        Name
      >;
      listRevenueCatEventsEligibleForRetentionPurge: FunctionReference<
        "query",
        "internal",
        {
          limit: number;
          older_than_ms: number;
          status: "processed" | "ignored" | "dead_letter";
        },
        any,
        Name
      >;
      listRevenueCatEventsForStatus: FunctionReference<
        "query",
        "internal",
        {
          limit: number;
          status:
            | "pending"
            | "failed"
            | "processed"
            | "ignored"
            | "dead_letter";
        },
        any,
        Name
      >;
      listSubscriptionStatesDueForExpirationReconciliation: FunctionReference<
        "query",
        "internal",
        { limit: number; now_ms: number },
        any,
        Name
      >;
      markSubscriptionQuotaUsageFailed: FunctionReference<
        "mutation",
        "internal",
        { now_ms: number; usage_event_id: string },
        any,
        Name
      >;
      markUserDeletionAuthDeleted: FunctionReference<
        "mutation",
        "internal",
        { now_ms: number; user_id: string },
        any,
        Name
      >;
      purgeRevenueCatEventsById: FunctionReference<
        "mutation",
        "internal",
        { event_doc_ids: Array<string> },
        any,
        Name
      >;
      recordRevenueCatEventProcessingProgress: FunctionReference<
        "mutation",
        "internal",
        {
          error_message?: string;
          event_doc_id: string;
          ignored_user_ids: Array<string>;
          next_retry_at_ms?: number;
          now_ms: number;
          processed_user_ids: Array<string>;
          processing_attempt_id?: string;
          released_user_ids?: Array<string>;
          retry_config?: {
            max_retry_count: number;
            retry_base_delay_ms: number;
            retry_max_delay_ms: number;
          };
          status_message?: string;
        },
        any,
        Name
      >;
      releaseSubscriptionStateReconciliation: FunctionReference<
        "mutation",
        "internal",
        {
          next_attempt_at_ms?: number;
          now_ms: number;
          sync_attempt_id: string;
          user_id: string;
        },
        any,
        Name
      >;
      renewUserDeletionOperationCleanupLease: FunctionReference<
        "mutation",
        "internal",
        {
          cleanup_attempt_id: string;
          cleanup_step:
            | "acquired"
            | "waiting_for_quiescence"
            | "deleting_subscription_data"
            | "finalizing_subscription_data"
            | "deleting_revenuecat_subscriber";
          lease_expires_at_ms: number;
          now_ms: number;
          user_id: string;
        },
        any,
        Name
      >;
      rescheduleUserDeletionOperation: FunctionReference<
        "mutation",
        "internal",
        {
          auth_deleted_at_ms?: number;
          cleanup_attempt_id?: string;
          cleanup_lease_expires_at_ms?: number;
          cleanup_step?:
            | "acquired"
            | "waiting_for_quiescence"
            | "deleting_subscription_data"
            | "finalizing_subscription_data"
            | "deleting_revenuecat_subscriber";
          last_error?: string | null;
          next_retry_at_ms: number;
          now_ms: number;
          retry_count_increment?: number;
          revenuecat_deleted_at_ms?: number;
          status:
            | "preparing"
            | "awaiting_auth_delete"
            | "awaiting_auth_delete_late"
            | "auth_delete_dead_letter"
            | "cleanup_dead_letter"
            | "ready_for_cleanup"
            | "waiting_for_quiescence"
            | "retryable_error"
            | "cleanup_in_progress";
          user_id: string;
        },
        any,
        Name
      >;
      reserveSubscriptionQuotaUsage: FunctionReference<
        "mutation",
        "internal",
        {
          input_char_count: number;
          model?: string;
          now_ms: number;
          operation: "translate" | "respell";
          req_id: string;
          signup_at_ms?: number;
          user_id: string;
        },
        any,
        Name
      >;
      startUserDeletionOperation: FunctionReference<
        "mutation",
        "internal",
        { now_ms: number; user_id: string },
        any,
        Name
      >;
      upsertUserDeletionPreparation: FunctionReference<
        "mutation",
        "internal",
        {
          cleanup_attempt_id?: string;
          has_active_subscription: boolean;
          now_ms?: number;
          prepared_at_ms: number;
          preserved_quota_period_id?: string;
          revenuecat_app_user_id?: string;
          store_subscription_id?: string;
          store_subscription_period_id?: string;
          user_id: string;
        },
        any,
        Name
      >;
    };
  };
