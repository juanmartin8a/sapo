import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getExclusiveLeaseOwnershipFailure } from "./leaseOwnership";

const quotaTerminalStateValidator = v.union(
    v.literal("completed"),
    v.literal("failed_before_charge"),
    v.literal("failed_after_charge"),
    v.literal("user_stopped_before_charge"),
    v.literal("user_stopped_after_charge")
);
const quotaRecoveryStatusValidator = v.union(v.literal("pending"), v.literal("dead_letter"));

type QuotaTerminalState =
    | "completed"
    | "failed_before_charge"
    | "failed_after_charge"
    | "user_stopped_before_charge"
    | "user_stopped_after_charge";

type QuotaRecoveryStatus = "pending" | "dead_letter";
type UsageEventId = Id<"usage_events">;

type QuotaRecoveryEntry = {
    usage_event_id: UsageEventId;
    terminal_state: QuotaTerminalState;
    status: QuotaRecoveryStatus;
    attempt_count: number;
    next_retry_at_ms: number;
    lease_attempt_id?: string;
    lease_expires_at_ms?: number;
    last_error?: string;
    created_at_ms: number;
    updated_at_ms: number;
};

async function listQuotaRecoveriesByUsageEventId(
    ctx: Pick<MutationCtx, "db"> | Pick<QueryCtx, "db">,
    usageEventId: UsageEventId
) {
    return ctx.db
        .query("quota_finalization_recoveries")
        .withIndex("by_usage_event_id", (query) => query.eq("usage_event_id", usageEventId))
        .collect();
}

function getLatestQuotaRecoveryEntry<
    T extends {
        _id: string;
        updated_at_ms: number;
        created_at_ms: number;
    },
>(entries: T[]) {
    return [...entries].sort((left, right) => {
        if (right.updated_at_ms !== left.updated_at_ms) {
            return right.updated_at_ms - left.updated_at_ms;
        }

        return right.created_at_ms - left.created_at_ms;
    })[0] ?? null;
}

function getQuotaRecoveryLeaseOwnershipFailure(args: {
    entry: QuotaRecoveryEntry;
    leaseAttemptId: string;
    nowMs: number;
}) {
    if (args.entry.status !== "pending") {
        return "owner_mismatch" as const;
    }

    return getExclusiveLeaseOwnershipFailure({
        current_attempt_id: args.entry.lease_attempt_id,
        attempt_id: args.leaseAttemptId,
        lease_expires_at_ms: args.entry.lease_expires_at_ms,
        now_ms: args.nowMs,
    });
}

async function replaceQuotaRecoveryEntry(
    ctx: MutationCtx,
    usageEventId: UsageEventId,
    nextEntry: QuotaRecoveryEntry
) {
    const existingEntries = await listQuotaRecoveriesByUsageEventId(ctx, usageEventId);
    const latestEntry = getLatestQuotaRecoveryEntry(existingEntries);
    const retainedEntryId = latestEntry
        ? latestEntry._id
        : await ctx.db.insert("quota_finalization_recoveries", nextEntry);

    if (latestEntry) {
        await ctx.db.replace(retainedEntryId, nextEntry);
    }

    for (const entry of existingEntries) {
        if (entry._id === retainedEntryId) {
            continue;
        }

        await ctx.db.delete(entry._id);
    }

    return {
        retained_entry_id: retainedEntryId,
        latest_entry: latestEntry,
    };
}

export async function deleteQuotaFinalizationRecoveriesByUsageEventId(
    ctx: MutationCtx,
    usageEventId: Doc<"usage_events">["_id"]
) {
    const entries = await listQuotaRecoveriesByUsageEventId(ctx, usageEventId);

    for (const entry of entries) {
        await ctx.db.delete(entry._id);
    }

    return entries.length;
}

export const enqueueQuotaFinalizationRecovery = mutation({
    args: {
        usageEventId: v.id("usage_events"),
        terminalState: quotaTerminalStateValidator,
        nowMs: v.number(),
        nextRetryAtMs: v.optional(v.number()),
        lastError: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const usageEvent = await ctx.db.get(args.usageEventId);

        if (!usageEvent) {
            return {
                recovery_id: null,
                attempt_count: 0,
                next_retry_at_ms: args.nextRetryAtMs ?? args.nowMs,
                status: "missing_usage_event" as const,
            };
        }

        const existingEntries = await listQuotaRecoveriesByUsageEventId(ctx, args.usageEventId);
        const latestEntry = getLatestQuotaRecoveryEntry(existingEntries);

        if (
            latestEntry?.status === "pending" &&
            typeof latestEntry.lease_expires_at_ms === "number" &&
            latestEntry.lease_expires_at_ms > Date.now()
        ) {
            return {
                recovery_id: latestEntry._id,
                attempt_count: latestEntry.attempt_count,
                next_retry_at_ms: latestEntry.next_retry_at_ms,
                lease_expires_at_ms: latestEntry.lease_expires_at_ms,
                status: "lease_active" as const,
            };
        }

        const nextEntry: QuotaRecoveryEntry = {
            usage_event_id: args.usageEventId,
            terminal_state: args.terminalState,
            status: "pending",
            attempt_count:
                latestEntry?.terminal_state === args.terminalState && latestEntry.status === "pending"
                    ? latestEntry.attempt_count
                    : 0,
            next_retry_at_ms: args.nextRetryAtMs ?? args.nowMs,
            ...(typeof args.lastError === "string"
                ? { last_error: args.lastError.slice(0, 400) }
                : {}),
            created_at_ms: latestEntry?.created_at_ms ?? args.nowMs,
            updated_at_ms: args.nowMs,
        };

        const replaceResult = await replaceQuotaRecoveryEntry(ctx, args.usageEventId, nextEntry);

        return {
            recovery_id: replaceResult.retained_entry_id,
            attempt_count: nextEntry.attempt_count,
            next_retry_at_ms: nextEntry.next_retry_at_ms,
            status: nextEntry.status,
        };
    },
});

export const listDueQuotaFinalizationRecoveries = query({
    args: {
        nowMs: v.number(),
        limit: v.number(),
    },
    handler: async (ctx, args) => {
        const safeLimit = Math.max(1, Math.min(args.limit, 200));
        const entries = await ctx.db
            .query("quota_finalization_recoveries")
            .withIndex("by_status_and_next_retry_at_ms", (query) =>
                query.eq("status", "pending").lte("next_retry_at_ms", args.nowMs)
            )
            .take(safeLimit);

        return entries.map((entry) => ({
            usage_event_id: entry.usage_event_id,
            next_retry_at_ms: entry.next_retry_at_ms,
            attempt_count: entry.attempt_count,
        }));
    },
});

export const listDeadLetterQuotaFinalizationRecoveries = query({
    args: {
        limit: v.number(),
    },
    handler: async (ctx, args) => {
        const safeLimit = Math.max(1, Math.min(args.limit, 100));
        const entries = await ctx.db
            .query("quota_finalization_recoveries")
            .withIndex("by_status_and_next_retry_at_ms", (query) =>
                query.eq("status", "dead_letter")
            )
            .order("asc")
            .take(safeLimit);

        return entries.map((entry) => ({
            usage_event_id: entry.usage_event_id,
            terminal_state: entry.terminal_state,
            attempt_count: entry.attempt_count,
            next_retry_at_ms: entry.next_retry_at_ms,
            last_error: entry.last_error,
            created_at_ms: entry.created_at_ms,
            updated_at_ms: entry.updated_at_ms,
        }));
    },
});

export const acquireQuotaFinalizationRecovery = mutation({
    args: {
        usageEventId: v.id("usage_events"),
        leaseAttemptId: v.string(),
        leaseDurationMs: v.number(),
    },
    handler: async (ctx, args) => {
        const latestEntry = getLatestQuotaRecoveryEntry(
            await listQuotaRecoveriesByUsageEventId(ctx, args.usageEventId)
        );
        const acquisitionNowMs = Date.now();
        const leaseExpiresAtMs = acquisitionNowMs + Math.max(0, args.leaseDurationMs);

        if (!latestEntry) {
            return {
                acquired: false,
                missing: true,
            };
        }

        if (latestEntry.status !== "pending") {
            return {
                acquired: false,
                missing: false,
                status: latestEntry.status,
            };
        }

        if (latestEntry.next_retry_at_ms > acquisitionNowMs) {
            return {
                acquired: false,
                missing: false,
                status: latestEntry.status,
                next_retry_at_ms: latestEntry.next_retry_at_ms,
            };
        }

        if (
            typeof latestEntry.lease_expires_at_ms === "number" &&
            latestEntry.lease_expires_at_ms > acquisitionNowMs
        ) {
            return {
                acquired: false,
                missing: false,
                status: latestEntry.status,
                next_retry_at_ms: latestEntry.next_retry_at_ms,
                lease_expires_at_ms: latestEntry.lease_expires_at_ms,
            };
        }

        await ctx.db.patch(latestEntry._id, {
            lease_attempt_id: args.leaseAttemptId,
            lease_expires_at_ms: leaseExpiresAtMs,
            updated_at_ms: acquisitionNowMs,
        });

        return {
            acquired: true,
            missing: false,
            recovery: {
                usage_event_id: latestEntry.usage_event_id,
                terminal_state: latestEntry.terminal_state,
                attempt_count: latestEntry.attempt_count,
                next_retry_at_ms: latestEntry.next_retry_at_ms,
                lease_attempt_id: args.leaseAttemptId,
                lease_expires_at_ms: leaseExpiresAtMs,
                last_error: latestEntry.last_error,
                status: latestEntry.status,
            },
        };
    },
});

export const updateQuotaFinalizationRecovery = mutation({
    args: {
        usageEventId: v.id("usage_events"),
        leaseAttemptId: v.string(),
        nowMs: v.number(),
        status: quotaRecoveryStatusValidator,
        attemptCount: v.number(),
        nextRetryAtMs: v.number(),
        lastError: v.optional(v.union(v.string(), v.null())),
    },
    handler: async (ctx, args) => {
        const latestEntry = getLatestQuotaRecoveryEntry(
            await listQuotaRecoveriesByUsageEventId(ctx, args.usageEventId)
        );

        if (!latestEntry) {
            return {
                updated: false,
                missing: true,
            };
        }

        const ownershipCheckNowMs = Date.now();
        const ownershipFailure = getQuotaRecoveryLeaseOwnershipFailure({
            entry: latestEntry as QuotaRecoveryEntry,
            leaseAttemptId: args.leaseAttemptId,
            nowMs: ownershipCheckNowMs,
        });

        if (ownershipFailure) {
            return {
                updated: false,
                missing: false,
                status: latestEntry.status,
                next_retry_at_ms: latestEntry.next_retry_at_ms,
                lease_expires_at_ms: latestEntry.lease_expires_at_ms,
                owner_mismatch:
                    ownershipFailure === "owner_required" ||
                    ownershipFailure === "owner_mismatch",
                lease_expired: ownershipFailure === "lease_expired",
                ownership_failure: ownershipFailure,
            };
        }

        const nextEntry: QuotaRecoveryEntry = {
            usage_event_id: latestEntry.usage_event_id,
            terminal_state: latestEntry.terminal_state,
            status: args.status,
            attempt_count: Math.max(0, Math.floor(args.attemptCount)),
            next_retry_at_ms: args.nextRetryAtMs,
            ...(typeof args.lastError === "string"
                ? { last_error: args.lastError.slice(0, 400) }
                : {}),
            created_at_ms: latestEntry.created_at_ms,
            updated_at_ms: args.nowMs,
        };

        await replaceQuotaRecoveryEntry(ctx, args.usageEventId, nextEntry);

        return {
            updated: true,
            missing: false,
            status: nextEntry.status,
            attempt_count: nextEntry.attempt_count,
            next_retry_at_ms: nextEntry.next_retry_at_ms,
        };
    },
});

export const clearQuotaFinalizationRecovery = mutation({
    args: {
        usageEventId: v.id("usage_events"),
        leaseAttemptId: v.string(),
        nowMs: v.number(),
    },
    handler: async (ctx, args) => {
        const latestEntry = getLatestQuotaRecoveryEntry(
            await listQuotaRecoveriesByUsageEventId(ctx, args.usageEventId)
        );

        if (!latestEntry) {
            return {
                deleted_count: 0,
                missing: true,
            };
        }

        const ownershipCheckNowMs = Date.now();
        const ownershipFailure = getQuotaRecoveryLeaseOwnershipFailure({
            entry: latestEntry as QuotaRecoveryEntry,
            leaseAttemptId: args.leaseAttemptId,
            nowMs: ownershipCheckNowMs,
        });

        if (ownershipFailure) {
            return {
                deleted_count: 0,
                missing: false,
                status: latestEntry.status,
                next_retry_at_ms: latestEntry.next_retry_at_ms,
                lease_expires_at_ms: latestEntry.lease_expires_at_ms,
                owner_mismatch:
                    ownershipFailure === "owner_required" ||
                    ownershipFailure === "owner_mismatch",
                lease_expired: ownershipFailure === "lease_expired",
                ownership_failure: ownershipFailure,
            };
        }

        return {
            deleted_count: await deleteQuotaFinalizationRecoveriesByUsageEventId(
                ctx,
                args.usageEventId
            ),
        };
    },
});
