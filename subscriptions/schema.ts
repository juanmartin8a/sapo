import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    subscription_plan_limits: defineTable({
        plan_key: v.union(v.literal("free"), v.literal("polyglot")),
        translate_input_char_limit: v.number(),
        respell_input_char_limit: v.number(),
        translate_monthly_char_limit: v.number(),
        respell_monthly_char_limit: v.number(),
        is_active: v.boolean(),
        updated_at_ms: v.number(),
    }).index("by_plan_key", ["plan_key"]),

    // This table serves as the current period quota's source of truth
    subscription_states: defineTable({
        user_id: v.string(),
        revenuecat_app_user_id: v.optional(v.string()),
        plan_key: v.union(v.literal("free"), v.literal("polyglot")),
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
        translate_chars_used: v.optional(v.number()),
        respell_chars_used: v.optional(v.number()),
        last_revenuecat_event_id: v.optional(v.string()),
        last_revenuecat_event_at_ms: v.optional(v.number()),
        last_synced_at_ms: v.number(),
        stale_after_at_ms: v.number(),
        created_at_ms: v.number(),
        updated_at_ms: v.number(),
    })
        .index("by_user_id", ["user_id"])
        .index("by_stale_after_at_ms", ["stale_after_at_ms"]),

    quota_periods: defineTable({
        user_id: v.union(v.string(), v.null()),
        window_key: v.string(),
        window_type: v.union(v.literal("anchored_monthly"), v.literal("billing_cycle")),
        period_start_at_ms: v.number(),
        period_end_at_ms: v.number(),
        plan_key: v.union(v.literal("free"), v.literal("polyglot")),
        active_subscription: v.boolean(),
        store_subscription_id: v.optional(v.string()),
        store_subscription_period_id: v.optional(v.string()),
        entitlement_id: v.optional(v.string()),
        product_id: v.optional(v.string()),
        store: v.optional(v.string()),
        environment: v.optional(v.string()),
        translate_input_char_limit: v.number(),
        respell_input_char_limit: v.number(),
        translate_period_char_limit: v.number(),
        respell_period_char_limit: v.number(),
        translate_charged_chars: v.number(),
        respell_charged_chars: v.number(),
        status: v.union(v.literal("open"), v.literal("closed"), v.literal("frozen")),
        last_charged_at_ms: v.optional(v.number()),
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
        .index("by_status_and_period_end_at_ms", ["status", "period_end_at_ms"]),

    user_deletion_operations: defineTable({
        user_id: v.string(),
        started_at_ms: v.number(),
        updated_at_ms: v.number(),
    }).index("by_user_id", ["user_id"]),

    user_deletion_preparations: defineTable({
        user_id: v.string(),
        revenuecat_app_user_id: v.optional(v.string()),
        has_active_subscription: v.boolean(),
        preserved_quota_period_id: v.optional(v.id("quota_periods")),
        store_subscription_id: v.optional(v.string()),
        store_subscription_period_id: v.optional(v.string()),
        prepared_at_ms: v.number(),
    }).index("by_user_id", ["user_id"]),

    usage_events: defineTable({
        req_id: v.string(),
        user_id: v.string(),
        quota_period_id: v.id("quota_periods"),
        operation: v.union(v.literal("respell"), v.literal("translate")),
        model: v.optional(v.string()),
        quota_unit: v.literal("input_characters"),
        reserved_units: v.number(),
        charged_units: v.number(),
        state: v.union(
            v.literal("reserved"),
            v.literal("processing"),
            v.literal("completed"),
            v.literal("failed_before_charge"),
            v.literal("failed_after_charge"),
            v.literal("user_stopped_before_charge"),
            v.literal("user_stopped_after_charge"),
        ),
        reserved_at_ms: v.number(),
        charged_at_ms: v.optional(v.number()),
        completed_at_ms: v.optional(v.number()),
        failed_at_ms: v.optional(v.number()),
        stopped_at_ms: v.optional(v.number()),
        quota_applied_at_ms: v.optional(v.number()),
        created_at_ms: v.number(),
        updated_at_ms: v.number(),
    })
        .index("by_req_id", ["req_id"])
        .index("by_user_id_and_req_id", ["user_id", "req_id"])
        .index("by_user_id_and_state", ["user_id", "state"])
        .index("by_quota_period_id", ["quota_period_id"])
        .index("by_quota_period_id_and_state", ["quota_period_id", "state"])
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
        // Legacy compatibility for already-ingested webhook events.
        original_transaction_id: v.optional(v.string()),
        store: v.optional(v.string()),
        environment: v.optional(v.string()),
        expiration_at_ms: v.optional(v.number()),
        grace_period_expiration_at_ms: v.optional(v.number()),
        purchased_at_ms: v.optional(v.number()),
        payload: v.optional(v.string()),
        status: v.union(
            v.literal("pending"),
            v.literal("processed"),
            v.literal("ignored"),
            v.literal("failed"),
            v.literal("dead_letter")
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
});
