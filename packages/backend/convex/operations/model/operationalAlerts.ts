import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type {
    DeleteResolvedOperationalAlertsArgs,
    ListOpenOperationalAlertsArgs,
    MarkOperationalAlertNotifiedArgs,
    RecordOperationalAlertArgs,
} from "../validators/operationalAlerts";

const ALERT_NOTIFY_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const DEFAULT_OPEN_ALERT_LIMIT = 50;
const MAX_OPEN_ALERT_LIMIT = 100;
const MAX_RETENTION_PURGE_LIMIT = 500;

type ActiveOperationalAlertStatus = "open" | "acknowledged";

function clampInteger(value: number, min: number, max: number) {
    return Math.max(min, Math.min(Math.floor(value), max));
}

function truncate(value: string, maxLength = 2_000) {
    return value.length > maxLength ? value.slice(0, maxLength) : value;
}

async function getLatestOperationalAlertForStatus(
    ctx: MutationCtx,
    args: Pick<RecordOperationalAlertArgs, "kind" | "entity_key">,
    status: ActiveOperationalAlertStatus
) {
    return ctx.db
        .query("operational_alerts")
        .withIndex("by_kind_entity_key_status_and_last_seen_at_ms", (query) =>
            query
                .eq("kind", args.kind)
                .eq("entity_key", args.entity_key)
                .eq("status", status)
        )
        .order("desc")
        .first();
}

function getMostRecentAlert(
    left: Doc<"operational_alerts"> | null,
    right: Doc<"operational_alerts"> | null
) {
    if (!left) return right;
    if (!right) return left;
    return left.last_seen_at_ms >= right.last_seen_at_ms ? left : right;
}

export async function recordOperationalAlert(ctx: MutationCtx, args: RecordOperationalAlertArgs) {
    const [openAlert, acknowledgedAlert] = await Promise.all([
        getLatestOperationalAlertForStatus(ctx, args, "open"),
        getLatestOperationalAlertForStatus(ctx, args, "acknowledged"),
    ]);
    const existingAlert = getMostRecentAlert(openAlert, acknowledgedAlert);
    const shouldNotify =
        !existingAlert ||
        typeof existingAlert.next_notify_at_ms !== "number" ||
        existingAlert.next_notify_at_ms <= args.now_ms;

    if (existingAlert) {
        await ctx.db.patch("operational_alerts", existingAlert._id, {
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
    args: MarkOperationalAlertNotifiedArgs
) {
    await ctx.db.patch("operational_alerts", args.alert_id, {
        notified_at_ms: args.now_ms,
        next_notify_at_ms: args.now_ms + ALERT_NOTIFY_COOLDOWN_MS,
    });
    return null;
}

export async function listOpenOperationalAlerts(
    ctx: QueryCtx,
    args: ListOpenOperationalAlertsArgs
) {
    const limit = clampInteger(args.limit ?? DEFAULT_OPEN_ALERT_LIMIT, 1, MAX_OPEN_ALERT_LIMIT);
    return ctx.db
        .query("operational_alerts")
        .withIndex("by_status_and_last_seen_at_ms", (query) => query.eq("status", "open"))
        .order("desc")
        .take(limit);
}

export async function deleteResolvedOperationalAlertsEligibleForRetentionPurge(
    ctx: MutationCtx,
    args: DeleteResolvedOperationalAlertsArgs
) {
    const limit = clampInteger(args.limit, 1, MAX_RETENTION_PURGE_LIMIT);
    const alerts = await ctx.db
        .query("operational_alerts")
        .withIndex("by_status_and_resolved_at_ms", (query) =>
            query.eq("status", "resolved").lte("resolved_at_ms", args.older_than_ms)
        )
        .take(limit);
    let deletedCount = 0;

    for (const alert of alerts) {
        const resolvedAtMs = alert.resolved_at_ms ?? alert.last_seen_at_ms;

        if (resolvedAtMs > args.older_than_ms) {
            continue;
        }

        await ctx.db.delete("operational_alerts", alert._id);
        deletedCount += 1;
    }

    return {
        scanned_count: alerts.length,
        deleted_count: deletedCount,
    };
}
