import { v } from "convex/values";

import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

const streamOperationValidator = v.union(v.literal("translate"), v.literal("respell"));
const STALE_STREAM_CONTROL_AGE_MS = 30_000;
const STALE_STREAM_CONTROL_SWEEP_LIMIT = 100;

type StreamOperation = "translate" | "respell";

function isStreamControlLive(
    streamControl: {
        lease_expires_at_ms: number;
    },
    nowMs: number
) {
    return streamControl.lease_expires_at_ms > nowMs;
}

function getStaleStreamControlCutoffMs(nowMs: number) {
    return nowMs - STALE_STREAM_CONTROL_AGE_MS;
}

async function listUserStreamControls(
    ctx: Pick<MutationCtx, "db"> | Pick<QueryCtx, "db">,
    userId: string
) {
    return ctx.db
        .query("stream_controls")
        .withIndex("by_user_id", (query) => query.eq("user_id", userId))
        .collect();
}

async function getStreamControlByOperation(
    ctx: Pick<MutationCtx, "db"> | Pick<QueryCtx, "db">,
    args: {
        streamId: string;
        userId: string;
        operation: StreamOperation;
    }
) {
    const streamControls = await ctx.db
        .query("stream_controls")
        .withIndex("by_user_id_operation_stream_id", (query) =>
            query
                .eq("user_id", args.userId)
                .eq("operation", args.operation)
                .eq("stream_id", args.streamId)
        )
        .collect();

    return streamControls.sort((left, right) => {
        if (right.updated_at_ms !== left.updated_at_ms) {
            return right.updated_at_ms - left.updated_at_ms;
        }

        return right.created_at_ms - left.created_at_ms;
    })[0] ?? null;
}

export const registerStreamControl = mutation({
    args: {
        streamId: v.string(),
        userId: v.string(),
        operation: streamOperationValidator,
        nowMs: v.number(),
        leaseExpiresAtMs: v.number(),
    },
    handler: async (ctx, args) => {
        const existingStreamControls = await ctx.db
            .query("stream_controls")
            .withIndex("by_user_id_operation_stream_id", (query) =>
                query
                    .eq("user_id", args.userId)
                    .eq("operation", args.operation)
                    .eq("stream_id", args.streamId)
            )
            .collect();

        if (existingStreamControls.some((streamControl) => isStreamControlLive(streamControl, args.nowMs))) {
            throw new Error(
                `sapopinguino stream already exists: ${args.userId}:${args.operation}:${args.streamId}`
            );
        }

        for (const existingStreamControl of existingStreamControls) {
            await ctx.db.delete(existingStreamControl._id);
        }

        await ctx.db.insert("stream_controls", {
            stream_id: args.streamId,
            user_id: args.userId,
            operation: args.operation,
            lease_expires_at_ms: args.leaseExpiresAtMs,
            created_at_ms: args.nowMs,
            updated_at_ms: args.nowMs,
        });
    },
});

export const requestStreamStop = mutation({
    args: {
        streamId: v.string(),
        userId: v.string(),
        operation: streamOperationValidator,
        nowMs: v.number(),
    },
    handler: async (ctx, args) => {
        const streamControl = await getStreamControlByOperation(ctx, args);

        if (!streamControl) {
            return { accepted: false };
        }

        if (streamControl.action === undefined) {
            await ctx.db.patch(streamControl._id, {
                operation: args.operation,
                action: "stop",
                updated_at_ms: args.nowMs,
            });
        }

        return { accepted: true };
    },
});

export const requestUserStreamStops = mutation({
    args: {
        userId: v.string(),
        nowMs: v.number(),
    },
    handler: async (ctx, args) => {
        const streamControls = await listUserStreamControls(ctx, args.userId);

        for (const streamControl of streamControls) {
            await ctx.db.patch(streamControl._id, {
                action: "stop",
                updated_at_ms: args.nowMs,
            });
        }

        return {
            requested_count: streamControls.length,
        };
    },
});

export const getStreamControlStatus = query({
    args: {
        streamId: v.string(),
        userId: v.string(),
        operation: streamOperationValidator,
    },
    handler: async (ctx, args) => {
        const streamControl = await getStreamControlByOperation(ctx, args);

        return {
            exists: streamControl !== null,
            action: streamControl?.action ?? null,
        };
    },
});

export const getUserStreamControlCount = query({
    args: {
        userId: v.string(),
    },
    handler: async (ctx, args) => {
        const streamControls = await listUserStreamControls(ctx, args.userId);

        return {
            stream_control_count: streamControls.length,
        };
    },
});

export const getUserStreamControlQuiescence = query({
    args: {
        userId: v.string(),
        nowMs: v.number(),
    },
    handler: async (ctx, args) => {
        const streamControls = await listUserStreamControls(ctx, args.userId);
        let liveStreamControlCount = 0;

        for (const streamControl of streamControls) {
            if (isStreamControlLive(streamControl, args.nowMs)) {
                liveStreamControlCount += 1;
            }
        }

        return {
            total_stream_control_count: streamControls.length,
            live_stream_control_count: liveStreamControlCount,
            orphaned_stream_control_count: streamControls.length - liveStreamControlCount,
        };
    },
});

export const refreshStreamControlLease = mutation({
    args: {
        streamId: v.string(),
        userId: v.string(),
        operation: streamOperationValidator,
        nowMs: v.number(),
        leaseExpiresAtMs: v.number(),
    },
    handler: async (ctx, args) => {
        const streamControl = await getStreamControlByOperation(ctx, args);

        if (!streamControl) {
            return {
                exists: false,
                action: null,
            };
        }

        try {
            await ctx.db.patch(streamControl._id, {
                lease_expires_at_ms: args.leaseExpiresAtMs,
                updated_at_ms: args.nowMs,
            });
        } catch (error) {
            const refreshedStreamControl = await getStreamControlByOperation(ctx, args);

            if (!refreshedStreamControl) {
                return {
                    exists: false,
                    action: null,
                };
            }

            throw error;
        }

        return {
            exists: true,
            action: streamControl.action ?? null,
        };
    },
});

export const consumeStreamControlAction = mutation({
    args: {
        streamId: v.string(),
        userId: v.string(),
        operation: streamOperationValidator,
    },
    handler: async (ctx, args) => {
        const streamControl = await getStreamControlByOperation(ctx, args);
        const action = streamControl?.action ?? null;

        if (action === null) {
            return { action: null };
        }

        if (streamControl) {
            await ctx.db.delete(streamControl._id);
        }

        return {
            action,
        };
    },
});

export const clearStreamControl = mutation({
    args: {
        streamId: v.string(),
        userId: v.string(),
        operation: streamOperationValidator,
    },
    handler: async (ctx, args) => {
        const streamControl = await getStreamControlByOperation(ctx, args);

        if (!streamControl) {
            return { cleared: false };
        }

        await ctx.db.delete(streamControl._id);

        return { cleared: true };
    },
});

export const deleteUserStreamControls = mutation({
    args: {
        userId: v.string(),
    },
    handler: async (ctx, args) => {
        const streamControls = await listUserStreamControls(ctx, args.userId);

        for (const streamControl of streamControls) {
            await ctx.db.delete(streamControl._id);
        }

        return {
            deleted_count: streamControls.length,
        };
    },
});

export const deleteStaleStreamControls = mutation({
    args: {
        nowMs: v.number(),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const safeLimit = Math.max(1, Math.min(args.limit ?? STALE_STREAM_CONTROL_SWEEP_LIMIT, 500));
        const staleCutoffMs = getStaleStreamControlCutoffMs(args.nowMs);
        const staleCandidates = await ctx.db
            .query("stream_controls")
            .withIndex("by_updated_at_ms", (query) => query.lt("updated_at_ms", staleCutoffMs))
            .order("asc")
            .take(safeLimit);
        let deletedCount = 0;

        for (const staleCandidate of staleCandidates) {
            if (isStreamControlLive(staleCandidate, args.nowMs)) {
                continue;
            }

            await ctx.db.delete(staleCandidate._id);
            deletedCount += 1;
        }

        return {
            scanned_count: staleCandidates.length,
            deleted_count: deletedCount,
        };
    },
});
