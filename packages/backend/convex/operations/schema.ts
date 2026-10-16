import { defineSchema, defineTable } from "convex/server";
import { operationalAlertFields } from "./validators/operationalAlerts";

export default defineSchema({
    operational_alerts: defineTable(operationalAlertFields)
        .index("by_kind_entity_key_status_and_last_seen_at_ms", [
            "kind",
            "entity_key",
            "status",
            "last_seen_at_ms",
        ])
        .index("by_status_and_last_seen_at_ms", ["status", "last_seen_at_ms"])
        .index("by_status_and_resolved_at_ms", ["status", "resolved_at_ms"]),
});
