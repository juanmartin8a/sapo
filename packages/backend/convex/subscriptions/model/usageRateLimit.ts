import type { MutationCtx } from "../_generated/server";

const USAGE_RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;
const MAX_CONCURRENT_REQUESTS = 3;

export async function isUsageRequestRateLimited(
    ctx: Pick<MutationCtx, "db">,
    userId: string,
    nowMs: number
) {
    const activeRequests = await ctx.db
        .query("usage_events")
        .withIndex("by_user_id_and_state", (query) =>
            query.eq("user_id", userId).eq("state", "processing")
        )
        .take(MAX_CONCURRENT_REQUESTS);

    if (activeRequests.length >= MAX_CONCURRENT_REQUESTS) {
        return true;
    }

    // Count failed requests too: repeated upstream failures still incur work.
    const recentRequests = await ctx.db
        .query("usage_events")
        .withIndex("by_user_id_and_created_at_ms", (query) =>
            query.eq("user_id", userId).gt("created_at_ms", nowMs - USAGE_RATE_WINDOW_MS)
        )
        .take(MAX_REQUESTS_PER_WINDOW);

    return recentRequests.length >= MAX_REQUESTS_PER_WINDOW;
}
