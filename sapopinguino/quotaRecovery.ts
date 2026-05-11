import { v } from "convex/values";

import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

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

type QuotaRecoveryEntry = {
    usage_event_id: string;
    terminal_state: QuotaTerminalState;
    status: QuotaRecoveryStatus;
    attempt_count: number;
    next_retry_at_ms: number;
    lease_expires_at_ms?: number;
    last_error?: string;
    created_at_ms: number;
    updated_at_ms: number;
};

async function listQuotaRecoveriesByUsageEventId(
    ctx: Pick<MutationCtx, "db"> | Pick<QueryCtx, "db">,
    usageEventId: string
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

async function replaceQuotaRecoveryEntry(
    ctx: MutationCtx,
    usageEventId: string,
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

export const enqueueQuotaFinalizationRecovery = mutation({
    args: {
        usageEventId: v.string(),
        terminalState: quotaTerminalStateValidator,
        nowMs: v.number(),
        nextRetryAtMs: v.optional(v.number()),
        lastError: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const existingEntries = await listQuotaRecoveriesByUsageEventId(ctx, args.usageEventId);
        const latestEntry = getLatestQuotaRecoveryEntry(existingEntries);
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

export const acquireQuotaFinalizationRecovery = mutation({
    args: {
        usageEventId: v.string(),
        nowMs: v.number(),
        leaseExpiresAtMs: v.number(),
    },
    handler: async (ctx, args) => {
        const latestEntry = getLatestQuotaRecoveryEntry(
            await listQuotaRecoveriesByUsageEventId(ctx, args.usageEventId)
        );

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

        if (latestEntry.next_retry_at_ms > args.nowMs) {
            return {
                acquired: false,
                missing: false,
                status: latestEntry.status,
                next_retry_at_ms: latestEntry.next_retry_at_ms,
            };
        }

        if (
            typeof latestEntry.lease_expires_at_ms === "number" &&
            latestEntry.lease_expires_at_ms > args.nowMs
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
            lease_expires_at_ms: args.leaseExpiresAtMs,
            updated_at_ms: args.nowMs,
        });

        return {
            acquired: true,
            missing: false,
            recovery: {
                usage_event_id: latestEntry.usage_event_id,
                terminal_state: latestEntry.terminal_state,
                attempt_count: latestEntry.attempt_count,
                next_retry_at_ms: latestEntry.next_retry_at_ms,
                last_error: latestEntry.last_error,
                status: latestEntry.status,
            },
        };
    },
});

export const updateQuotaFinalizationRecovery = mutation({
    args: {
        usageEventId: v.string(),
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
        usageEventId: v.string(),
    },
    handler: async (ctx, args) => {
        const entries = await listQuotaRecoveriesByUsageEventId(ctx, args.usageEventId);

        for (const entry of entries) {
            await ctx.db.delete(entry._id);
        }

        return {
            deleted_count: entries.length,
        };
    },
});
