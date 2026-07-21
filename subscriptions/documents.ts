import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export type DbReaderCtx = Pick<MutationCtx, "db"> | Pick<QueryCtx, "db">;

export async function listSubscriptionStatesByUserId(ctx: DbReaderCtx, userId: string) {
    return ctx.db
        .query("subscription_states")
        .withIndex("by_user_id", (query) => query.eq("user_id", userId))
        .collect();
}

export async function getLatestSubscriptionStateByUserId(ctx: DbReaderCtx, userId: string) {
    return ctx.db
        .query("subscription_states")
        .withIndex("by_user_id_and_updated_at_ms", (query) => query.eq("user_id", userId))
        .order("desc")
        .first();
}

export async function listQuotaPeriodsByUserId(ctx: DbReaderCtx, userId: string) {
    return ctx.db
        .query("quota_periods")
        .withIndex("by_user_id_and_period_start_at_ms", (query) => query.eq("user_id", userId))
        .collect();
}

export async function listQuotaPeriodsByUserIdAndWindowKey(
    ctx: DbReaderCtx,
    userId: string,
    windowKey: string
) {
    return ctx.db
        .query("quota_periods")
        .withIndex("by_user_id_and_window_key", (query) =>
            query.eq("user_id", userId).eq("window_key", windowKey)
        )
        .collect();
}

export async function listQuotaPeriodsByUserIdBatch(
    ctx: DbReaderCtx,
    userId: string,
    limit: number
) {
    return ctx.db
        .query("quota_periods")
        .withIndex("by_user_id_and_period_start_at_ms", (query) => query.eq("user_id", userId))
        .take(Math.max(1, limit));
}

export async function prepareQuotaPeriodsForUserDeletionBatch(
    ctx: DbReaderCtx,
    args: {
        user_id: string;
        preserved_quota_period_id?: Id<"quota_periods">;
        delete_limit: number;
    }
) {
    const deleteLimit = Math.max(1, args.delete_limit);
    const candidates = await listQuotaPeriodsByUserIdBatch(
        ctx,
        args.user_id,
        deleteLimit + (args.preserved_quota_period_id ? 2 : 1)
    );
    const deletableCandidates = candidates.filter(
        (quotaPeriod) => quotaPeriod._id !== args.preserved_quota_period_id
    );
    const quotaPeriods = deletableCandidates.slice(0, deleteLimit);

    return {
        quota_periods: quotaPeriods,
        has_more: deletableCandidates.length > quotaPeriods.length,
    };
}

export async function listUsageEventsByUserId(ctx: DbReaderCtx, userId: string) {
    return ctx.db
        .query("usage_events")
        .withIndex("by_user_id_and_created_at_ms", (query) => query.eq("user_id", userId))
        .collect();
}

export async function listUsageEventsByUserIdBatch(
    ctx: DbReaderCtx,
    userId: string,
    limit: number
) {
    return ctx.db
        .query("usage_events")
        .withIndex("by_user_id_and_created_at_ms", (query) => query.eq("user_id", userId))
        .take(Math.max(1, limit));
}

export async function deleteUsageEventsByUserIdBatch(
    ctx: Pick<MutationCtx, "db">,
    userId: string,
    limit: number
) {
    const safeLimit = Math.max(1, limit);
    const candidates = await listUsageEventsByUserIdBatch(ctx, userId, safeLimit + 1);
    const usageEvents = candidates.slice(0, safeLimit);

    for (const usageEvent of usageEvents) {
        await ctx.db.delete(usageEvent._id);
    }

    return {
        deleted_count: usageEvents.length,
        has_more: candidates.length > usageEvents.length,
    };
}

export async function listActiveUsageEventsByUserId(ctx: DbReaderCtx, userId: string) {
    return ctx.db
        .query("usage_events")
        .withIndex("by_user_id_and_state", (query) =>
            query.eq("user_id", userId).eq("state", "processing")
        )
        .collect();
}

export async function listActiveUsageEventsByUserIdBatch(
    ctx: DbReaderCtx,
    userId: string,
    limit: number
) {
    const safeLimit = Math.max(1, limit);
    return ctx.db
        .query("usage_events")
        .withIndex("by_user_id_and_state", (query) =>
            query.eq("user_id", userId).eq("state", "processing")
        )
        .take(safeLimit);
}
