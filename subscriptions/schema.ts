import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
    INPUT_CHARACTERS_QUOTA_UNIT,
    SUBSCRIPTION_PLAN_KEYS,
    SUBSCRIPTION_USAGE_OPERATIONS,
} from "../constants/subscriptions";
import { REVENUECAT_WEBHOOK_EVENT_STATUSES } from "../constants/revenueCat";
import {
    USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS,
    USER_DELETION_CLEANUP_DEAD_LETTER_STATUS,
    USER_DELETION_CLEANUP_STEPS,
    USER_DELETION_LATE_AUTH_WAIT_STATUS,
    USER_DELETION_QUEUE_STATUSES,
} from "../constants/userDeletion";

export default defineSchema({
    subscription_plan_limits: defineTable({
        plan_key: v.union(v.literal(SUBSCRIPTION_PLAN_KEYS.FREE), v.literal(SUBSCRIPTION_PLAN_KEYS.POLYGLOT)),
        translate_input_char_limit: v.number(),
        respell_input_char_limit: v.number(),
        translate_monthly_char_limit: v.number(),
        respell_monthly_char_limit: v.number(),
        is_active: v.boolean(),
        updated_at_ms: v.number(),
    }).index("by_plan_key", ["plan_key"]),

    // Current subscription metadata. Quota consumption lives in quota_period_counters.
    subscription_states: defineTable({
        user_id: v.string(),
        revenuecat_app_user_id: v.optional(v.string()),
        plan_key: v.union(v.literal(SUBSCRIPTION_PLAN_KEYS.FREE), v.literal(SUBSCRIPTION_PLAN_KEYS.POLYGLOT)),
        has_active_subscription: v.boolean(),
        store_subscription_id: v.optional(v.string()),
        store_subscription_period_id: v.optional(v.string()),
        entitlement_id: v.optional(v.string()),
        product_id: v.optional(v.string()),
        store: v.optional(v.string()),
        environment: v.optional(v.string()),
        billing_cycle_start_at_ms: v.optional(v.number()),
        billing_cycle_end_at_ms: v.optional(v.number()),
        free_period_anchor_at_ms: v.optional(v.number()),
        window_type: v.union(v.literal("anchored_monthly"), v.literal("billing_cycle")),
        window_key: v.string(),
        window_start_at_ms: v.number(),
        window_end_at_ms: v.number(),
        last_revenuecat_event_id: v.optional(v.string()),
        last_revenuecat_event_at_ms: v.optional(v.number()),
        sync_attempt_id: v.optional(v.string()),
        sync_started_at_ms: v.optional(v.number()),
        sync_expires_at_ms: v.optional(v.number()),
        pending_active_signal_at_ms: v.optional(v.number()),
        pending_active_expires_at_ms: v.optional(v.number()),
        last_synced_at_ms: v.number(),
        stale_after_at_ms: v.number(),
        created_at_ms: v.number(),
        updated_at_ms: v.number(),
    })
        .index("by_user_id", ["user_id"])
        .index("by_user_id_and_updated_at_ms", ["user_id", "updated_at_ms"])
        .index("by_stale_after_at_ms", ["stale_after_at_ms"]),

    quota_periods: defineTable({
        user_id: v.union(v.string(), v.null()),
        window_key: v.string(),
        window_type: v.union(v.literal("anchored_monthly"), v.literal("billing_cycle")),
        period_start_at_ms: v.number(),
        period_end_at_ms: v.number(),
        plan_key: v.union(v.literal(SUBSCRIPTION_PLAN_KEYS.FREE), v.literal(SUBSCRIPTION_PLAN_KEYS.POLYGLOT)),
        active_subscription: v.boolean(),
        store_subscription_id: v.optional(v.string()),
        store_subscription_period_id: v.optional(v.string()),
        entitlement_id: v.optional(v.string()),
        product_id: v.optional(v.string()),
        store: v.optional(v.string()),
        environment: v.optional(v.string()),
        status: v.union(v.literal("open"), v.literal("closed"), v.literal("frozen")),
        closed_at_ms: v.optional(v.number()),
        frozen_at_ms: v.optional(v.number()),
        restored_at_ms: v.optional(v.number()),
        restored_to_quota_period_id: v.optional(v.id("quota_periods")),
        created_at_ms: v.number(),
        updated_at_ms: v.number(),
    })
        .index("by_user_id_and_window_key", ["user_id", "window_key"])
        .index("by_user_id_and_period_start_at_ms", ["user_id", "period_start_at_ms"])
        .index("by_store_subscription_period_id", ["store_subscription_period_id"])
        .index("by_status_and_period_start_at_ms", ["status", "period_start_at_ms"])
        .index("by_status_and_period_end_at_ms", ["status", "period_end_at_ms"])
        .index("by_status_user_id_and_period_end_at_ms", ["status", "user_id", "period_end_at_ms"]),

    quota_period_counters: defineTable({
        quota_period_id: v.id("quota_periods"),
        operation: v.union(
            v.literal(SUBSCRIPTION_USAGE_OPERATIONS.TRANSLATE),
            v.literal(SUBSCRIPTION_USAGE_OPERATIONS.RESPELL)
        ),
        quota_unit: v.literal(INPUT_CHARACTERS_QUOTA_UNIT),
        charged_units: v.number(),
        input_limit: v.number(),
        period_limit: v.number(),
        last_charged_at_ms: v.optional(v.number()),
        created_at_ms: v.number(),
        updated_at_ms: v.number(),
    })
        .index("by_quota_period_id", ["quota_period_id"])
        .index("by_quota_period_id_operation_unit", [
            "quota_period_id",
            "operation",
            "quota_unit",
        ]),

    user_deletion_queue: defineTable({
        user_id: v.string(),
        status: v.union(
            v.literal(USER_DELETION_QUEUE_STATUSES[0]),
            v.literal(USER_DELETION_QUEUE_STATUSES[1]),
            v.literal(USER_DELETION_LATE_AUTH_WAIT_STATUS),
            v.literal(USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS),
            v.literal(USER_DELETION_CLEANUP_DEAD_LETTER_STATUS),
            v.literal(USER_DELETION_QUEUE_STATUSES[5]),
            v.literal(USER_DELETION_QUEUE_STATUSES[6]),
            v.literal(USER_DELETION_QUEUE_STATUSES[7]),
            v.literal(USER_DELETION_QUEUE_STATUSES[8])
        ),
        started_at_ms: v.number(),
        prepared_at_ms: v.optional(v.number()),
        auth_deleted_at_ms: v.optional(v.number()),
        revenuecat_deleted_at_ms: v.optional(v.number()),
        next_retry_at_ms: v.number(),
        retry_count: v.number(),
        last_error: v.optional(v.string()),
        cleanup_attempt_id: v.optional(v.string()),
        cleanup_step: v.optional(
            v.union(
                v.literal(USER_DELETION_CLEANUP_STEPS[0]),
                v.literal(USER_DELETION_CLEANUP_STEPS[1]),
                v.literal(USER_DELETION_CLEANUP_STEPS[2]),
                v.literal(USER_DELETION_CLEANUP_STEPS[3]),
                v.literal(USER_DELETION_CLEANUP_STEPS[4])
            )
        ),
        cleanup_step_started_at_ms: v.optional(v.number()),
        cleanup_lease_expires_at_ms: v.optional(v.number()),
        revenuecat_app_user_id: v.optional(v.string()),
        has_active_subscription: v.optional(v.boolean()),
        preserved_quota_period_id: v.optional(v.id("quota_periods")),
        store_subscription_id: v.optional(v.string()),
        store_subscription_period_id: v.optional(v.string()),
        updated_at_ms: v.number(),
    })
        .index("by_user_id", ["user_id"])
        .index("by_next_retry_at_ms", ["next_retry_at_ms"])
        .index("by_status_and_next_retry_at_ms", ["status", "next_retry_at_ms"])
        .index("by_status_and_updated_at_ms", ["status", "updated_at_ms"]),

    usage_events: defineTable({
        req_id: v.string(),
        user_id: v.string(),
        quota_period_id: v.id("quota_periods"),
        operation: v.union(
            v.literal(SUBSCRIPTION_USAGE_OPERATIONS.RESPELL),
            v.literal(SUBSCRIPTION_USAGE_OPERATIONS.TRANSLATE)
        ),
        model: v.optional(v.string()),
        quota_unit: v.literal(INPUT_CHARACTERS_QUOTA_UNIT),
        reserved_units: v.number(),
        charged_units: v.number(),
        state: v.union(
            v.literal("processing"),
            v.literal("completed"),
            v.literal("failed"),
            v.literal("indeterminate")
        ),
        quota_state: v.union(
            v.literal("reserved"),
            v.literal("charged"),
            v.literal("released")
        ),
        reserved_at_ms: v.number(),
        charged_at_ms: v.optional(v.number()),
        released_at_ms: v.optional(v.number()),
        completed_at_ms: v.optional(v.number()),
        failed_at_ms: v.optional(v.number()),
        indeterminate_at_ms: v.optional(v.number()),
        created_at_ms: v.number(),
        updated_at_ms: v.number(),
    })
        .index("by_req_id", ["req_id"])
        .index("by_user_id_and_req_id", ["user_id", "req_id"])
        .index("by_user_id_and_state", ["user_id", "state"])
        .index("by_quota_period_id", ["quota_period_id"])
        .index("by_quota_period_id_quota_state_operation", [
            "quota_period_id",
            "quota_state",
            "operation",
        ])
        .index("by_user_id_and_created_at_ms", ["user_id", "created_at_ms"]),

    revenue_cat_events: defineTable({
        event_id: v.string(),
        event_type: v.string(),
        event_at_ms: v.number(),
        received_at_ms: v.number(),
        app_user_id: v.optional(v.string()),
        original_app_user_id: v.optional(v.string()),
        aliases: v.array(v.string()),
        transferred_from: v.array(v.string()),
        transferred_to: v.array(v.string()),
        user_id: v.optional(v.string()),
        entitlement_ids: v.array(v.string()),
        product_id: v.optional(v.string()),
        transaction_id: v.optional(v.string()),
        store: v.optional(v.string()),
        environment: v.optional(v.string()),
        expiration_at_ms: v.optional(v.number()),
        grace_period_expiration_at_ms: v.optional(v.number()),
        purchased_at_ms: v.optional(v.number()),
        payload: v.optional(v.string()),
        status: v.union(
            v.literal(REVENUECAT_WEBHOOK_EVENT_STATUSES.PENDING),
            v.literal(REVENUECAT_WEBHOOK_EVENT_STATUSES.PROCESSED),
            v.literal(REVENUECAT_WEBHOOK_EVENT_STATUSES.IGNORED),
            v.literal(REVENUECAT_WEBHOOK_EVENT_STATUSES.FAILED),
            v.literal(REVENUECAT_WEBHOOK_EVENT_STATUSES.DEAD_LETTER)
        ),
        retry_count: v.number(),
        next_retry_at_ms: v.number(),
        processed_at_ms: v.optional(v.number()),
        last_error: v.optional(v.string()),
        created_at_ms: v.number(),
        updated_at_ms: v.number(),
    })
        .index("by_event_id", ["event_id"])
        .index("by_status_and_next_retry_at_ms", ["status", "next_retry_at_ms"])
        .index("by_status_and_updated_at_ms", ["status", "updated_at_ms"])
        .index("by_app_user_id_and_event_at_ms", ["app_user_id", "event_at_ms"])
        .index("by_original_app_user_id_and_event_at_ms", ["original_app_user_id", "event_at_ms"])
        .index("by_user_id_and_event_at_ms", ["user_id", "event_at_ms"]),

    revenue_cat_event_users: defineTable({
        event_doc_id: v.id("revenue_cat_events"),
        user_id: v.string(),
        status: v.union(v.literal("pending"), v.literal("processed"), v.literal("ignored")),
        processing_attempt_id: v.optional(v.string()),
        processing_started_at_ms: v.optional(v.number()),
        processing_expires_at_ms: v.optional(v.number()),
        created_at_ms: v.number(),
        updated_at_ms: v.number(),
    })
        .index("by_event_doc_id_and_user_id", ["event_doc_id", "user_id"])
        .index("by_event_doc_id_and_status", ["event_doc_id", "status"])
        .index("by_user_id_and_event_doc_id", ["user_id", "event_doc_id"])
        .index("by_user_id_status_and_processing_expires_at_ms", [
            "user_id",
            "status",
            "processing_expires_at_ms",
        ]),

    refresh_rate_limits: defineTable({
        user_id: v.string(),
        kind: v.union(
            v.literal("refresh_normal"),
            v.literal("refresh_purchase"),
            v.literal("refresh_daily")
        ),
        window_start_ms: v.number(),
        window_end_ms: v.number(),
        count: v.number(),
        updated_at_ms: v.number(),
    })
        .index("by_user_id_and_kind", ["user_id", "kind"])
        .index("by_user_id_kind_and_window_start_ms", ["user_id", "kind", "window_start_ms"])
        .index("by_updated_at_ms", ["updated_at_ms"]),
});
