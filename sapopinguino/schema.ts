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
        .index("by_user_id_and_lease_expires_at_ms", ["user_id", "lease_expires_at_ms"])
        .index("by_updated_at_ms", ["updated_at_ms"]),

});
