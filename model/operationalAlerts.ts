import { makeFunctionReference } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { sendOperationalAlertEmail } from "./email";
import { getOperationalAlertsResolvedRetentionMs } from "./subscriptions/config";

const ALERT_NOTIFY_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const RESOLVED_ALERT_PURGE_BATCH_LIMIT = 500;
const RESOLVED_ALERT_PURGE_MAX_BATCHES = 10;

export type AlertSeverity = "warning" | "error" | "critical";
type OperationalAlert = Doc<"operational_alerts">;
type RecordOperationalAlertArgs = {
    kind: string;
    entity_key: string;
    severity: AlertSeverity;
    title: string;
    message: string;
    last_error?: string;
};
type RecordOperationalAlertResult = {
    alert_id: Id<"operational_alerts">;
    should_notify: boolean;
};

const recordOperationalAlertMutation = makeFunctionReference<
    "mutation",
    RecordOperationalAlertArgs & { now_ms: number },
    RecordOperationalAlertResult
>("operationalAlerts:recordOperationalAlert");
const markOperationalAlertNotifiedMutation = makeFunctionReference<
    "mutation",
    { alert_id: Id<"operational_alerts">; now_ms: number },
    void
>("operationalAlerts:markOperationalAlertNotified");
const deleteResolvedOperationalAlertsMutation = makeFunctionReference<
    "mutation",
    { older_than_ms: number; limit: number },
    { scanned_count: number; deleted_count: number }
>("operationalAlerts:deleteResolvedOperationalAlertsEligibleForRetentionPurge");

function truncate(value: string, maxLength = 2_000) {
    return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export async function recordOperationalAlert(
    ctx: MutationCtx,
    args: RecordOperationalAlertArgs & { now_ms: number },
): Promise<RecordOperationalAlertResult> {
    const existingAlerts = await ctx.db
        .query("operational_alerts")
        .withIndex("by_kind_entity_key", (query) =>
            query.eq("kind", args.kind).eq("entity_key", args.entity_key),
        )
        .collect();
    const existingAlert =
        [...existingAlerts]
            .filter((alert: OperationalAlert) => alert.status !== "resolved")
            .sort(
                (left, right) => right.last_seen_at_ms - left.last_seen_at_ms,
            )[0] ?? null;
    const shouldNotify =
        !existingAlert ||
        typeof existingAlert.next_notify_at_ms !== "number" ||
        existingAlert.next_notify_at_ms <= args.now_ms;

    if (existingAlert) {
        await ctx.db.patch(existingAlert._id, {
            severity: args.severity,
            status: "open",
            title: truncate(args.title, 300),
            message: truncate(args.message),
            ...(typeof args.last_error === "string"
                ? { last_error: truncate(args.last_error, 1_000) }
                : {}),
            occurrence_count: existingAlert.occurrence_count + 1,
            last_seen_at_ms: args.now_ms,
        });

        return {
            alert_id: existingAlert._id,
            should_notify: shouldNotify,
        };
    }

    const alertId = await ctx.db.insert("operational_alerts", {
        kind: args.kind,
        entity_key: args.entity_key,
        severity: args.severity,
        status: "open",
        title: truncate(args.title, 300),
        message: truncate(args.message),
        ...(typeof args.last_error === "string"
            ? { last_error: truncate(args.last_error, 1_000) }
            : {}),
        occurrence_count: 1,
        first_seen_at_ms: args.now_ms,
        last_seen_at_ms: args.now_ms,
    });

    return {
        alert_id: alertId,
        should_notify: true,
    };
}

export async function markOperationalAlertNotified(
    ctx: MutationCtx,
    args: { alert_id: Id<"operational_alerts">; now_ms: number },
): Promise<void> {
    await ctx.db.patch(args.alert_id, {
        notified_at_ms: args.now_ms,
        next_notify_at_ms: args.now_ms + ALERT_NOTIFY_COOLDOWN_MS,
    });
}

export async function recordOperationalAlertAndNotify(
    ctx: ActionCtx,
    args: RecordOperationalAlertArgs,
): Promise<RecordOperationalAlertResult> {
    const nowMs = Date.now();
    const alert = await ctx.runMutation(recordOperationalAlertMutation, {
        ...args,
        now_ms: nowMs,
    });
    const alertEmail = process.env.OPERATIONAL_ALERT_EMAIL;

    if (!alert.should_notify || !alertEmail) {
        return alert;
    }

    try {
        await sendOperationalAlertEmail(
            ctx,
            alertEmail,
            `[SAPO] ${args.title}`,
            [
                args.message,
                "",
                `Kind: ${args.kind}`,
                `Entity: ${args.entity_key}`,
                `Severity: ${args.severity}`,
                ...(args.last_error
                    ? ["", `Last error: ${args.last_error}`]
                    : []),
            ].join("\n"),
        );
        await ctx.runMutation(markOperationalAlertNotifiedMutation, {
            alert_id: alert.alert_id,
            now_ms: Date.now(),
        });
    } catch (error) {
        console.warn("Failed to send operational alert email:", error);
    }

    return alert;
}

export async function listOpenOperationalAlerts(
    ctx: QueryCtx,
    args: { limit?: number },
) {
    const limit = Math.max(1, Math.min(args.limit ?? 50, 100));
    return ctx.db
        .query("operational_alerts")
        .withIndex("by_status_and_last_seen_at_ms", (query) =>
            query.eq("status", "open"),
        )
        .order("desc")
        .take(limit);
}

export async function deleteResolvedOperationalAlertsEligibleForRetentionPurge(
    ctx: MutationCtx,
    args: { older_than_ms: number; limit: number },
) {
    const limit = Math.max(1, Math.min(args.limit, 500));
    const alerts = await ctx.db
        .query("operational_alerts")
        .withIndex("by_status_and_resolved_at_ms", (query) =>
            query
                .eq("status", "resolved")
                .lte("resolved_at_ms", args.older_than_ms),
        )
        .take(limit);
    let deletedCount = 0;

    for (const alert of alerts) {
        const resolvedAtMs = alert.resolved_at_ms ?? alert.last_seen_at_ms;

        if (resolvedAtMs > args.older_than_ms) {
            continue;
        }

        await ctx.db.delete(alert._id);
        deletedCount += 1;
    }

    return {
        scanned_count: alerts.length,
        deleted_count: deletedCount,
    };
}

export async function purgeResolvedOperationalAlerts(ctx: ActionCtx) {
    const retentionMs = getOperationalAlertsResolvedRetentionMs();
    const olderThanMs = Date.now() - retentionMs;
    let batchCount = 0;
    let scannedCount = 0;
    let deletedCount = 0;

    while (batchCount < RESOLVED_ALERT_PURGE_MAX_BATCHES) {
        const purgeResult = await ctx.runMutation(
            deleteResolvedOperationalAlertsMutation,
            {
                older_than_ms: olderThanMs,
                limit: RESOLVED_ALERT_PURGE_BATCH_LIMIT,
            },
        );

        batchCount += 1;
        scannedCount += purgeResult.scanned_count;
        deletedCount += purgeResult.deleted_count;

        if (purgeResult.scanned_count < RESOLVED_ALERT_PURGE_BATCH_LIMIT) {
            break;
        }
    }

    return {
        retention_ms: retentionMs,
        older_than_ms: olderThanMs,
        batch_count: batchCount,
        scanned_count: scannedCount,
        deleted_count: deletedCount,
    };
}
