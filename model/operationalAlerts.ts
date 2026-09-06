import { components } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { sendOperationalAlertEmail } from "./email";
import { OPERATIONAL_ALERTS_RESOLVED_RETENTION_MS } from "../constants/operationalAlerts";
import type { RecordOperationalAlertAndNotifyArgs } from "../operations/validators/operationalAlerts";

const RESOLVED_ALERT_PURGE_BATCH_LIMIT = 500;
const RESOLVED_ALERT_PURGE_MAX_BATCHES = 10;

export async function recordOperationalAlertAndNotify(
    ctx: ActionCtx,
    args: RecordOperationalAlertAndNotifyArgs,
) {
    const nowMs = Date.now();
    const alert = await ctx.runMutation(components.operations.operationalAlerts.recordOperationalAlert, {
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
        await ctx.runMutation(components.operations.operationalAlerts.markOperationalAlertNotified, {
            alert_id: alert.alert_id,
            now_ms: Date.now(),
        });
    } catch (error) {
        console.warn("Failed to send operational alert email:", error);
    }

    return alert;
}

export async function purgeResolvedOperationalAlerts(ctx: ActionCtx) {
    const retentionMs = OPERATIONAL_ALERTS_RESOLVED_RETENTION_MS;
    const olderThanMs = Date.now() - retentionMs;
    let batchCount = 0;
    let scannedCount = 0;
    let deletedCount = 0;

    while (batchCount < RESOLVED_ALERT_PURGE_MAX_BATCHES) {
        const purgeResult = await ctx.runMutation(
            components.operations.operationalAlerts
                .deleteResolvedOperationalAlertsEligibleForRetentionPurge,
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
