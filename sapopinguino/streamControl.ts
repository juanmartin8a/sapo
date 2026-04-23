import { v } from "convex/values";

import { components as appComponents } from "../_generated/api";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

const streamOperationValidator = v.union(v.literal("translate"), v.literal("respell"));

type StreamOperation = "translate" | "respell";

async function getStreamControlByOperation(
    ctx: Pick<MutationCtx, "db"> | Pick<QueryCtx, "db">,
    args: {
        streamId: string;
        userId: string;
        operation: StreamOperation;
    }
) {
    return ctx.db
        .query("stream_controls")
        .withIndex("by_user_id_operation_stream_id", (query) =>
            query
                .eq("user_id", args.userId)
                .eq("operation", args.operation)
                .eq("stream_id", args.streamId)
        )
        .first();
}

export const registerStreamControl = mutation({
    args: {
        streamId: v.string(),
        userId: v.string(),
        operation: streamOperationValidator,
        nowMs: v.number(),
    },
    handler: async (ctx, args) => {
        const existing = await getStreamControlByOperation(ctx, args);

        if (existing) {
            throw new Error(
                `sapopinguino stream already exists: ${args.userId}:${args.operation}:${args.streamId}`
            );
        }

        const [user, deletionOperationState] = await Promise.all([
            (ctx as any).runQuery(appComponents.betterAuth.adapter.findOne, {
                model: "user",
                where: [{ field: "_id", value: args.userId }],
            }) as Promise<{ _id: string } | null>,
            (ctx as any).runQuery(
                (appComponents.subscriptions.webhook as Record<string, unknown>)
                    .getUserDeletionOperationState,
                {
                    user_id: args.userId,
                }
            ) as Promise<{ in_progress: boolean }>,
        ]);

        if (!user) {
            throw new Error("Cannot register sapopinguino stream for missing user");
        }

        if ((deletionOperationState as { in_progress: boolean }).in_progress) {
            throw new Error("Cannot register sapopinguino stream while user deletion is in progress");
        }

        await ctx.db.insert("stream_controls", {
            stream_id: args.streamId,
            user_id: args.userId,
            operation: args.operation,
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
        const streamControls = await ctx.db
            .query("stream_controls")
            .withIndex("by_user_id", (query) => query.eq("user_id", args.userId))
            .collect();

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
        const streamControls = await ctx.db
            .query("stream_controls")
            .withIndex("by_user_id", (query) => query.eq("user_id", args.userId))
            .collect();

        return {
            stream_control_count: streamControls.length,
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
        const streamControls = await ctx.db
            .query("stream_controls")
            .withIndex("by_user_id", (query) => query.eq("user_id", args.userId))
            .collect();

        for (const streamControl of streamControls) {
            await ctx.db.delete(streamControl._id);
        }

        return {
            deleted_count: streamControls.length,
        };
    },
});
