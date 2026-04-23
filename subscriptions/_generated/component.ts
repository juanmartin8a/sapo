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
      applyReconciledSubscriptionState: FunctionReference<
        "mutation",
        "internal",
        {
          allow_user_deletion_in_progress?: boolean;
          expiration_reconciliation_delay_ms: number;
          revenuecat_app_user_id: string;
          signup_at_ms?: number;
          snapshot: {
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
          synced_at_ms: number;
          user_id: string;
        },
        any,
        Name
      >;
      applyUsageEventChargeToQuotaPeriod: FunctionReference<
        "mutation",
        "internal",
        { now_ms: number; usage_event_id: string },
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
      clearUserDeletionOperation: FunctionReference<
        "mutation",
        "internal",
        { user_id: string },
        any,
        Name
      >;
      clearUserDeletionPreparation: FunctionReference<
        "mutation",
        "internal",
        { user_id: string },
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
        { next_attempt_at_ms: number; user_id: string },
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
      forceStopUserActiveUsageEvents: FunctionReference<
        "mutation",
        "internal",
        { now_ms: number; user_id: string },
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
      getPreparedUserDeletionContext: FunctionReference<
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
      getUserDeletionCleanupStatus: FunctionReference<
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
          };
          raw_payload?: string;
          received_at_ms: number;
        },
        any,
        Name
      >;
      linkAnonymousSubscriptionStateToUser: FunctionReference<
        "mutation",
        "internal",
        { anonymous_user_id: string; now_ms: number; user_id: string },
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
      markRevenueCatEventIgnored: FunctionReference<
        "mutation",
        "internal",
        {
          event_doc_id: string;
          now_ms: number;
          reason: string;
          user_id?: string;
        },
        any,
        Name
      >;
      markRevenueCatEventProcessed: FunctionReference<
        "mutation",
        "internal",
        { event_doc_id: string; now_ms: number; user_id?: string },
        any,
        Name
      >;
      markRevenueCatEventProcessingFailure: FunctionReference<
        "mutation",
        "internal",
        {
          error_message: string;
          event_doc_id: string;
          now_ms: number;
          retry_config: {
            max_retry_count: number;
            retry_base_delay_ms: number;
            retry_max_delay_ms: number;
          };
        },
        any,
        Name
      >;
      markSubscriptionQuotaUsageFailed: FunctionReference<
        "mutation",
        "internal",
        { after_charge: boolean; now_ms: number; usage_event_id: string },
        any,
        Name
      >;
      markSubscriptionQuotaUsageStopped: FunctionReference<
        "mutation",
        "internal",
        { after_charge: boolean; now_ms: number; usage_event_id: string },
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
      upsertSubscriptionPlanLimits: FunctionReference<
        "mutation",
        "internal",
        {
          now_ms: number;
          plans: Array<{
            is_active: boolean;
            plan_key: "free" | "polyglot";
            respell_input_char_limit: number;
            respell_monthly_char_limit: number;
            translate_input_char_limit: number;
            translate_monthly_char_limit: number;
          }>;
        },
        any,
        Name
      >;
      upsertUserDeletionPreparation: FunctionReference<
        "mutation",
        "internal",
        {
          has_active_subscription: boolean;
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
