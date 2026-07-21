import { v } from "convex/values";

import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import * as OperationalAlerts from "./model/operationalAlerts";

const severityValidator = v.union(
    v.literal("warning"),
    v.literal("error"),
    v.literal("critical")
);

export const recordOperationalAlert = internalMutation({
    args: {
        kind: v.string(),
        entity_key: v.string(),
        severity: severityValidator,
        title: v.string(),
        message: v.string(),
        last_error: v.optional(v.string()),
        now_ms: v.number(),
    },
    handler: OperationalAlerts.recordOperationalAlert,
});

export const markOperationalAlertNotified = internalMutation({
    args: {
        alert_id: v.id("operational_alerts"),
        now_ms: v.number(),
    },
    handler: OperationalAlerts.markOperationalAlertNotified,
});

export const recordOperationalAlertAndNotify = internalAction({
    args: {
        kind: v.string(),
        entity_key: v.string(),
        severity: severityValidator,
        title: v.string(),
        message: v.string(),
        last_error: v.optional(v.string()),
    },
    handler: OperationalAlerts.recordOperationalAlertAndNotify,
});

export const listOpenOperationalAlerts = internalQuery({
    args: {
        limit: v.optional(v.number()),
    },
    handler: OperationalAlerts.listOpenOperationalAlerts,
});

export const deleteResolvedOperationalAlertsEligibleForRetentionPurge = internalMutation({
    args: {
        older_than_ms: v.number(),
        limit: v.number(),
    },
    handler: OperationalAlerts.deleteResolvedOperationalAlertsEligibleForRetentionPurge,
});

export const purgeResolvedOperationalAlerts = internalAction({
    args: {},
    handler: OperationalAlerts.purgeResolvedOperationalAlerts,
});
