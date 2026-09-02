import { v, type ObjectType } from "convex/values";

export const operationalAlertSeverityValidator = v.union(
    v.literal("warning"),
    v.literal("error"),
    v.literal("critical")
);

export const operationalAlertStatusValidator = v.union(
    v.literal("open"),
    v.literal("acknowledged"),
    v.literal("resolved")
);

export const operationalAlertFields = {
    kind: v.string(),
    entity_key: v.string(),
    severity: operationalAlertSeverityValidator,
    status: operationalAlertStatusValidator,
    title: v.string(),
    message: v.string(),
    last_error: v.optional(v.string()),
    occurrence_count: v.number(),
    first_seen_at_ms: v.number(),
    last_seen_at_ms: v.number(),
    notified_at_ms: v.optional(v.number()),
    next_notify_at_ms: v.optional(v.number()),
    resolved_at_ms: v.optional(v.number()),
};

export const recordOperationalAlertAndNotifyArgs = {
    kind: v.string(),
    entity_key: v.string(),
    severity: operationalAlertSeverityValidator,
    title: v.string(),
    message: v.string(),
    last_error: v.optional(v.string()),
};

export type RecordOperationalAlertAndNotifyArgs = ObjectType<
    typeof recordOperationalAlertAndNotifyArgs
>;

export const recordOperationalAlertArgs = {
    ...recordOperationalAlertAndNotifyArgs,
    now_ms: v.number(),
};

export type RecordOperationalAlertArgs = ObjectType<typeof recordOperationalAlertArgs>;

export const recordOperationalAlertReturns = v.object({
    alert_id: v.id("operational_alerts"),
    should_notify: v.boolean(),
});

export const markOperationalAlertNotifiedArgs = {
    alert_id: v.id("operational_alerts"),
    now_ms: v.number(),
};

export type MarkOperationalAlertNotifiedArgs = ObjectType<
    typeof markOperationalAlertNotifiedArgs
>;

export const markOperationalAlertNotifiedReturns = v.null();

export const listOpenOperationalAlertsArgs = {
    limit: v.optional(v.number()),
};

export type ListOpenOperationalAlertsArgs = ObjectType<typeof listOpenOperationalAlertsArgs>;

export const listOpenOperationalAlertsReturns = v.array(
    v.object({
        _id: v.id("operational_alerts"),
        _creationTime: v.number(),
        ...operationalAlertFields,
    })
);

export const deleteResolvedOperationalAlertsArgs = {
    older_than_ms: v.number(),
    limit: v.number(),
};

export type DeleteResolvedOperationalAlertsArgs = ObjectType<
    typeof deleteResolvedOperationalAlertsArgs
>;

export const deleteResolvedOperationalAlertsReturns = v.object({
    scanned_count: v.number(),
    deleted_count: v.number(),
});
