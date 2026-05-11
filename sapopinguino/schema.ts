import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    stream_controls: defineTable({
        stream_id: v.string(),
        user_id: v.string(),
        operation: v.union(v.literal("translate"), v.literal("respell")),
        action: v.optional(v.literal("stop")),
        lease_expires_at_ms: v.number(),
        created_at_ms: v.number(),
        updated_at_ms: v.number(),
    })
        .index("by_stream_id", ["stream_id"])
        .index("by_user_id_operation_stream_id", ["user_id", "operation", "stream_id"])
        .index("by_user_id", ["user_id"])
        .index("by_updated_at_ms", ["updated_at_ms"]),

    quota_finalization_recoveries: defineTable({
        usage_event_id: v.string(),
        terminal_state: v.union(
            v.literal("completed"),
            v.literal("failed_before_charge"),
            v.literal("failed_after_charge"),
            v.literal("user_stopped_before_charge"),
            v.literal("user_stopped_after_charge")
        ),
        status: v.union(v.literal("pending"), v.literal("dead_letter")),
        attempt_count: v.number(),
        next_retry_at_ms: v.number(),
        lease_expires_at_ms: v.optional(v.number()),
        last_error: v.optional(v.string()),
        created_at_ms: v.number(),
        updated_at_ms: v.number(),
    })
        .index("by_usage_event_id", ["usage_event_id"])
        .index("by_status_and_next_retry_at_ms", ["status", "next_retry_at_ms"]),
});
