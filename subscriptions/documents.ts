import type { MutationCtx, QueryCtx } from "./_generated/server";

export type DbReaderCtx = Pick<MutationCtx, "db"> | Pick<QueryCtx, "db">;

export async function listSubscriptionStatesByUserId(ctx: DbReaderCtx, userId: string) {
    return ctx.db
        .query("subscription_states")
        .withIndex("by_user_id", (query) => query.eq("user_id", userId))
        .collect();
}

export async function getLatestSubscriptionStateByUserId(ctx: DbReaderCtx, userId: string) {
    const states = await listSubscriptionStatesByUserId(ctx, userId);

    return [...states].sort((left, right) => right.updated_at_ms - left.updated_at_ms)[0] ?? null;
}

export async function listQuotaPeriodsByUserId(ctx: DbReaderCtx, userId: string) {
    return ctx.db
        .query("quota_periods")
        .withIndex("by_user_id_and_period_start_at_ms", (query) => query.eq("user_id", userId))
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

export async function listActiveUsageEventsByUserId(ctx: DbReaderCtx, userId: string) {
    const [reservedUsageEvents, processingUsageEvents] = await Promise.all([
        ctx.db
            .query("usage_events")
            .withIndex("by_user_id_and_state", (query) =>
                query.eq("user_id", userId).eq("state", "reserved")
            )
            .collect(),
        ctx.db
            .query("usage_events")
            .withIndex("by_user_id_and_state", (query) =>
                query.eq("user_id", userId).eq("state", "processing")
            )
            .collect(),
    ]);

    return [...reservedUsageEvents, ...processingUsageEvents].sort(
        (left, right) => left.created_at_ms - right.created_at_ms
    );
}
