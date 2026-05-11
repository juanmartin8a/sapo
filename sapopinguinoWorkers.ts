import { v } from "convex/values";

import { components, internal } from "./_generated/api";
import { internalAction, type ActionCtx } from "./_generated/server";
import {
    classifySapopinguinoQuotaRecoveryResult,
    getSapopinguinoQuotaRecoveryDelayMs,
    hasReachedSapopinguinoQuotaRecoveryAttemptLimit,
} from "./sapopinguinoQuotaRecovery";

const STALE_STREAM_CONTROL_CLEANUP_BATCH_LIMIT = 100;
const STALE_STREAM_CONTROL_CLEANUP_MAX_BATCHES = 10;
const SAPOPINGUINO_QUOTA_RECOVERY_BATCH_LIMIT = 100;
const SAPOPINGUINO_QUOTA_RECOVERY_LEASE_MS = 30_000;

const sapopinguinoQuotaTerminalStateValidator = v.union(
    v.literal("completed"),
    v.literal("failed_before_charge"),
    v.literal("failed_after_charge"),
    v.literal("user_stopped_before_charge"),
    v.literal("user_stopped_after_charge")
);

type SapopinguinoQuotaRecoveryTerminalState =
    | "completed"
    | "failed_before_charge"
    | "failed_after_charge"
    | "user_stopped_before_charge"
    | "user_stopped_after_charge";

type SapopinguinoQuotaRecoveryEntry = {
    usage_event_id: string;
    terminal_state: SapopinguinoQuotaRecoveryTerminalState;
    attempt_count: number;
    next_retry_at_ms: number;
    last_error?: string;
    status: "pending" | "dead_letter";
};

type SapopinguinoWorkerCtx = Pick<ActionCtx, "runQuery" | "runMutation">;

function formatErrorMessage(error: unknown): string {
    if (typeof error === "object" && error && "message" in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === "string" && message.trim().length > 0) {
            return message.slice(0, 400);
        }
    }

    return "Unknown error";
}

async function listDueSapopinguinoQuotaRecoveryUsageEventIds(
    ctx: SapopinguinoWorkerCtx,
    args: {
        now_ms: number;
        limit: number;
    }
) {
    return (await (ctx as any).runQuery(
        ((components.sapopinguino as Record<string, unknown>).quotaRecovery as Record<string, unknown>)
            .listDueQuotaFinalizationRecoveries,
        {
            nowMs: args.now_ms,
            limit: args.limit,
        }
    )) as {
        usage_event_id: string;
        next_retry_at_ms: number;
        attempt_count: number;
    }[];
}

async function acquireSapopinguinoQuotaRecoveryByUsageEventId(
    ctx: SapopinguinoWorkerCtx,
    usageEventId: string,
    args: {
        now_ms: number;
        lease_expires_at_ms: number;
    }
) {
    return (await (ctx as any).runMutation(
        ((components.sapopinguino as Record<string, unknown>).quotaRecovery as Record<string, unknown>)
            .acquireQuotaFinalizationRecovery,
        {
            usageEventId,
            nowMs: args.now_ms,
            leaseExpiresAtMs: args.lease_expires_at_ms,
        }
    )) as
        | {
              acquired: true;
              missing: false;
              recovery: SapopinguinoQuotaRecoveryEntry;
          }
        | {
              acquired: false;
              missing: boolean;
              status?: "pending" | "dead_letter";
              next_retry_at_ms?: number;
              lease_expires_at_ms?: number;
          };
}

async function enqueueSapopinguinoQuotaRecoveryByUsageEventId(
    ctx: SapopinguinoWorkerCtx,
    args: {
        usage_event_id: string;
        terminal_state: SapopinguinoQuotaRecoveryTerminalState;
        now_ms: number;
        next_retry_at_ms?: number;
        last_error?: string;
    }
) {
    return (await (ctx as any).runMutation(
        ((components.sapopinguino as Record<string, unknown>).quotaRecovery as Record<string, unknown>)
            .enqueueQuotaFinalizationRecovery,
        {
            usageEventId: args.usage_event_id,
            terminalState: args.terminal_state,
            nowMs: args.now_ms,
            ...(typeof args.next_retry_at_ms === "number"
                ? { nextRetryAtMs: args.next_retry_at_ms }
                : {}),
            ...(typeof args.last_error === "string" ? { lastError: args.last_error } : {}),
        }
    )) as {
        attempt_count: number;
        next_retry_at_ms: number;
        status: "pending" | "dead_letter";
    };
}

async function updateSapopinguinoQuotaRecoveryByUsageEventId(
    ctx: SapopinguinoWorkerCtx,
    args: {
        usage_event_id: string;
        now_ms: number;
        status: "pending" | "dead_letter";
        attempt_count: number;
        next_retry_at_ms: number;
        last_error?: string | null;
    }
) {
    return (await (ctx as any).runMutation(
        ((components.sapopinguino as Record<string, unknown>).quotaRecovery as Record<string, unknown>)
            .updateQuotaFinalizationRecovery,
        {
            usageEventId: args.usage_event_id,
            nowMs: args.now_ms,
            status: args.status,
            attemptCount: args.attempt_count,
            nextRetryAtMs: args.next_retry_at_ms,
            ...(typeof args.last_error === "string" || args.last_error === null
                ? { lastError: args.last_error }
                : {}),
        }
    )) as {
        updated: boolean;
        missing: boolean;
        status?: "pending" | "dead_letter";
        attempt_count?: number;
        next_retry_at_ms?: number;
    };
}

async function clearSapopinguinoQuotaRecoveryByUsageEventId(
    ctx: SapopinguinoWorkerCtx,
    usageEventId: string
) {
    return (await (ctx as any).runMutation(
        ((components.sapopinguino as Record<string, unknown>).quotaRecovery as Record<string, unknown>)
            .clearQuotaFinalizationRecovery,
        {
            usageEventId,
        }
    )) as {
        deleted_count: number;
    };
}

async function scheduleSapopinguinoQuotaRecoveryRetry(
    ctx: Pick<ActionCtx, "scheduler">,
    args: {
        usageEventId: string;
        attempt: number;
    }
) {
    const nextAttempt = Math.max(0, Math.floor(args.attempt));
    const delayMs = getSapopinguinoQuotaRecoveryDelayMs(nextAttempt);

    await (ctx as any).scheduler.runAfter(
        delayMs,
        (internal as any).sapopinguinoWorkers.processSapopinguinoQuotaFinalizationRecovery,
        {
            usage_event_id: args.usageEventId,
        }
    );

    return {
        delay_ms: delayMs,
        attempt: nextAttempt,
    };
}

async function applySapopinguinoQuotaRecoveryTerminalTransition(
    ctx: SapopinguinoWorkerCtx,
    args: {
        usage_event_id: string;
        terminal_state: SapopinguinoQuotaRecoveryTerminalState;
        now_ms: number;
    }
) {
    switch (args.terminal_state) {
        case "completed":
            return ctx.runMutation(components.subscriptions.webhook.completeSubscriptionQuotaUsage, {
                usage_event_id: args.usage_event_id,
                now_ms: args.now_ms,
            });
        case "failed_before_charge":
            return ctx.runMutation(components.subscriptions.webhook.markSubscriptionQuotaUsageFailed, {
                usage_event_id: args.usage_event_id,
                after_charge: false,
                now_ms: args.now_ms,
            });
        case "failed_after_charge":
            return ctx.runMutation(components.subscriptions.webhook.markSubscriptionQuotaUsageFailed, {
                usage_event_id: args.usage_event_id,
                after_charge: true,
                now_ms: args.now_ms,
            });
        case "user_stopped_before_charge":
            return ctx.runMutation(components.subscriptions.webhook.markSubscriptionQuotaUsageStopped, {
                usage_event_id: args.usage_event_id,
                after_charge: false,
                now_ms: args.now_ms,
            });
        case "user_stopped_after_charge":
            return ctx.runMutation(components.subscriptions.webhook.markSubscriptionQuotaUsageStopped, {
                usage_event_id: args.usage_event_id,
                after_charge: true,
                now_ms: args.now_ms,
            });
    }
}

async function processSapopinguinoQuotaFinalizationRecoveryByUsageEventId(
    ctx: SapopinguinoWorkerCtx & Pick<ActionCtx, "scheduler">,
    args: {
        usage_event_id: string;
        now_ms: number;
    }
) {
    const acquiredRecovery = await acquireSapopinguinoQuotaRecoveryByUsageEventId(
        ctx,
        args.usage_event_id,
        {
            now_ms: args.now_ms,
            lease_expires_at_ms: args.now_ms + SAPOPINGUINO_QUOTA_RECOVERY_LEASE_MS,
        }
    );

    if (!acquiredRecovery.acquired) {
        if (acquiredRecovery.missing) {
            return {
                status: "missing" as const,
            };
        }

        return {
            status: "not_acquired" as const,
            next_retry_at_ms: acquiredRecovery.next_retry_at_ms,
            lease_expires_at_ms: acquiredRecovery.lease_expires_at_ms,
        };
    }

    const recovery = acquiredRecovery.recovery;

    try {
        const terminalTransitionResult = await applySapopinguinoQuotaRecoveryTerminalTransition(ctx, {
            usage_event_id: args.usage_event_id,
            terminal_state: recovery.terminal_state,
            now_ms: args.now_ms,
        });
        const recoveryDisposition = classifySapopinguinoQuotaRecoveryResult({
            terminalState: recovery.terminal_state,
            result: terminalTransitionResult,
        });

        if (recoveryDisposition.kind === "succeeded" || recoveryDisposition.kind === "missing") {
            await clearSapopinguinoQuotaRecoveryByUsageEventId(ctx, args.usage_event_id);

            return {
                status: recoveryDisposition.kind,
                attempt: recovery.attempt_count,
                terminal_transition: terminalTransitionResult,
            };
        }

        const nextAttemptCount = recovery.attempt_count + 1;

        if (recoveryDisposition.kind === "terminal_mismatch") {
            const errorMessage = `terminal_mismatch:${recoveryDisposition.state}`;

            await updateSapopinguinoQuotaRecoveryByUsageEventId(ctx, {
                usage_event_id: args.usage_event_id,
                now_ms: args.now_ms,
                status: "dead_letter",
                attempt_count: nextAttemptCount,
                next_retry_at_ms: args.now_ms,
                last_error: errorMessage,
            });

            console.error("Sapopinguino quota recovery reached a different terminal state", {
                usageEventId: args.usage_event_id,
                requested_terminal_state: recovery.terminal_state,
                actual_terminal_state: recoveryDisposition.state,
            });

            return {
                status: "dead_letter" as const,
                attempt: nextAttemptCount,
                terminal_transition: terminalTransitionResult,
                reason: errorMessage,
            };
        }

        const errorMessage = recoveryDisposition.reason;

        if (hasReachedSapopinguinoQuotaRecoveryAttemptLimit(nextAttemptCount)) {
            await updateSapopinguinoQuotaRecoveryByUsageEventId(ctx, {
                usage_event_id: args.usage_event_id,
                now_ms: args.now_ms,
                status: "dead_letter",
                attempt_count: nextAttemptCount,
                next_retry_at_ms: args.now_ms,
                last_error: errorMessage,
            });

            console.error("Sapopinguino quota recovery exhausted retry attempts", {
                usageEventId: args.usage_event_id,
                terminalState: recovery.terminal_state,
                attempt: nextAttemptCount,
                reason: errorMessage,
            });

            return {
                status: "dead_letter" as const,
                attempt: nextAttemptCount,
                terminal_transition: terminalTransitionResult,
                reason: errorMessage,
            };
        }

        const scheduledRetry = await scheduleSapopinguinoQuotaRecoveryRetry(ctx, {
            usageEventId: args.usage_event_id,
            attempt: nextAttemptCount,
        }).catch((error) => {
            console.error("Failed to schedule sapopinguino quota recovery retry", {
                usageEventId: args.usage_event_id,
                terminalState: recovery.terminal_state,
                attempt: nextAttemptCount,
                error,
            });

            return null;
        });
        const nextRetryAtMs = args.now_ms + getSapopinguinoQuotaRecoveryDelayMs(nextAttemptCount);

        await updateSapopinguinoQuotaRecoveryByUsageEventId(ctx, {
            usage_event_id: args.usage_event_id,
            now_ms: args.now_ms,
            status: "pending",
            attempt_count: nextAttemptCount,
            next_retry_at_ms: nextRetryAtMs,
            last_error: errorMessage,
        });

        console.warn("Scheduled sapopinguino quota recovery retry", {
            usageEventId: args.usage_event_id,
            terminalState: recovery.terminal_state,
            attempt: recovery.attempt_count,
            retry_reason: errorMessage,
            next_attempt: scheduledRetry?.attempt ?? nextAttemptCount,
            retry_delay_ms:
                scheduledRetry?.delay_ms ?? getSapopinguinoQuotaRecoveryDelayMs(nextAttemptCount),
        });

        return {
            status: "retry_scheduled" as const,
            attempt: recovery.attempt_count,
            retry_reason: errorMessage,
            next_attempt: scheduledRetry?.attempt ?? nextAttemptCount,
            retry_delay_ms:
                scheduledRetry?.delay_ms ?? getSapopinguinoQuotaRecoveryDelayMs(nextAttemptCount),
            terminal_transition: terminalTransitionResult,
        };
    } catch (error) {
        const nextAttemptCount = recovery.attempt_count + 1;
        const errorMessage = formatErrorMessage(error);

        if (hasReachedSapopinguinoQuotaRecoveryAttemptLimit(nextAttemptCount)) {
            await updateSapopinguinoQuotaRecoveryByUsageEventId(ctx, {
                usage_event_id: args.usage_event_id,
                now_ms: args.now_ms,
                status: "dead_letter",
                attempt_count: nextAttemptCount,
                next_retry_at_ms: args.now_ms,
                last_error: errorMessage,
            });

            console.error("Sapopinguino quota recovery attempt dead-lettered after exception", {
                usageEventId: args.usage_event_id,
                terminalState: recovery.terminal_state,
                attempt: nextAttemptCount,
                error,
            });

            return {
                status: "dead_letter" as const,
                attempt: nextAttemptCount,
                reason: errorMessage,
            };
        }

        const scheduledRetry = await scheduleSapopinguinoQuotaRecoveryRetry(ctx, {
            usageEventId: args.usage_event_id,
            attempt: nextAttemptCount,
        }).catch((scheduleError) => {
            console.error("Failed to schedule sapopinguino quota recovery retry after exception", {
                usageEventId: args.usage_event_id,
                terminalState: recovery.terminal_state,
                attempt: nextAttemptCount,
                error: scheduleError,
            });

            return null;
        });
        const nextRetryAtMs = args.now_ms + getSapopinguinoQuotaRecoveryDelayMs(nextAttemptCount);

        await updateSapopinguinoQuotaRecoveryByUsageEventId(ctx, {
            usage_event_id: args.usage_event_id,
            now_ms: args.now_ms,
            status: "pending",
            attempt_count: nextAttemptCount,
            next_retry_at_ms: nextRetryAtMs,
            last_error: errorMessage,
        });

        console.error("Sapopinguino quota recovery attempt failed", {
            usageEventId: args.usage_event_id,
            terminalState: recovery.terminal_state,
            attempt: recovery.attempt_count,
            retry_delay_ms:
                scheduledRetry?.delay_ms ?? getSapopinguinoQuotaRecoveryDelayMs(nextAttemptCount),
            next_attempt: scheduledRetry?.attempt ?? nextAttemptCount,
            error,
        });

        return {
            status: "retry_scheduled" as const,
            attempt: recovery.attempt_count,
            next_attempt: scheduledRetry?.attempt ?? nextAttemptCount,
            retry_delay_ms:
                scheduledRetry?.delay_ms ?? getSapopinguinoQuotaRecoveryDelayMs(nextAttemptCount),
            reason: errorMessage,
        };
    }
}

export const processSapopinguinoQuotaFinalizationRecovery = internalAction({
    args: {
        usage_event_id: v.string(),
    },
    handler: async (ctx, args) => {
        return processSapopinguinoQuotaFinalizationRecoveryByUsageEventId(ctx, {
            usage_event_id: args.usage_event_id,
            now_ms: Date.now(),
        });
    },
});

export const processQueuedSapopinguinoQuotaFinalizationRecoveries = internalAction({
    args: {},
    handler: async (ctx) => {
        const startedAtMs = Date.now();
        const dueRecoveries = await listDueSapopinguinoQuotaRecoveryUsageEventIds(ctx, {
            now_ms: startedAtMs,
            limit: SAPOPINGUINO_QUOTA_RECOVERY_BATCH_LIMIT,
        });
        const results: { usage_event_id: string; status: string }[] = [];

        for (const dueRecovery of dueRecoveries) {
            const result = await processSapopinguinoQuotaFinalizationRecoveryByUsageEventId(ctx, {
                usage_event_id: dueRecovery.usage_event_id,
                now_ms: Date.now(),
            });

            results.push({
                usage_event_id: dueRecovery.usage_event_id,
                status: result.status,
            });
        }

        return {
            started_at_ms: startedAtMs,
            scanned: dueRecoveries.length,
            results,
        };
    },
});

export const reconcileUsageEventQuotaApplication = internalAction({
    args: {
        // Component document IDs become opaque strings at the app boundary.
        usage_event_id: v.string(),
        terminal_state: v.optional(sapopinguinoQuotaTerminalStateValidator),
        attempt: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const nowMs = Date.now();

        if (args.terminal_state) {
            await enqueueSapopinguinoQuotaRecoveryByUsageEventId(ctx, {
                usage_event_id: args.usage_event_id,
                terminal_state: args.terminal_state,
                now_ms: nowMs,
                next_retry_at_ms: nowMs,
            });

            return processSapopinguinoQuotaFinalizationRecoveryByUsageEventId(ctx, {
                usage_event_id: args.usage_event_id,
                now_ms: nowMs,
            });
        }

        return ctx.runMutation(components.subscriptions.webhook.applyUsageEventChargeToQuotaPeriod, {
            usage_event_id: args.usage_event_id,
            now_ms: nowMs,
        });
    },
});

export const pruneStaleSapopinguinoStreamControls = internalAction({
    args: {},
    handler: async (ctx) => {
        let batchCount = 0;
        let scannedCount = 0;
        let deletedCount = 0;

        while (batchCount < STALE_STREAM_CONTROL_CLEANUP_MAX_BATCHES) {
            const batchResult = (await ctx.runMutation(
                components.sapopinguino.streamControl.deleteStaleStreamControls,
                {
                    nowMs: Date.now(),
                    limit: STALE_STREAM_CONTROL_CLEANUP_BATCH_LIMIT,
                }
            )) as {
                scanned_count: number;
                deleted_count: number;
            };

            batchCount += 1;
            scannedCount += batchResult.scanned_count;
            deletedCount += batchResult.deleted_count;

            if (
                batchResult.scanned_count < STALE_STREAM_CONTROL_CLEANUP_BATCH_LIMIT ||
                batchResult.deleted_count === 0
            ) {
                break;
            }
        }

        return {
            batch_count: batchCount,
            scanned_count: scannedCount,
            deleted_count: deletedCount,
        };
    },
});
