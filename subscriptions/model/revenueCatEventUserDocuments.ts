import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { summarizeRevenueCatEventUsers } from "../../model/subscriptions/revenueCatEventUsers";
import { resolveRevenueCatWebhookTargetUserIds as resolveTargetUserIdsFromRevenueCatEvent } from "../../model/subscriptions/revenueCatWebhookIngestion";

type DbReaderCtx = Pick<MutationCtx, "db"> | Pick<QueryCtx, "db">;
type DbWriterCtx = Pick<MutationCtx, "db">;

export async function listRevenueCatEventUsersByEventDocId(
    ctx: DbReaderCtx,
    eventDocId: Doc<"revenue_cat_events">["_id"]
) {
    return ctx.db
        .query("revenue_cat_event_users")
        .withIndex("by_event_doc_id_and_user_id", (query) => query.eq("event_doc_id", eventDocId))
        .collect();
}

export async function listRevenueCatEventUsersByUserIdBatch(
    ctx: DbReaderCtx,
    userId: string,
    limit: number
) {
    return ctx.db
        .query("revenue_cat_event_users")
        .withIndex("by_user_id_and_event_doc_id", (query) => query.eq("user_id", userId))
        .take(Math.max(1, limit));
}

export async function deleteRevenueCatEventUsersByEventDocId(
    ctx: DbWriterCtx,
    eventDocId: Doc<"revenue_cat_events">["_id"],
    eventUsers?: Pick<Doc<"revenue_cat_event_users">, "_id">[]
) {
    const usersToDelete = eventUsers ?? (await listRevenueCatEventUsersByEventDocId(ctx, eventDocId));

    for (const eventUser of usersToDelete) {
        await ctx.db.delete("revenue_cat_event_users", eventUser._id);
    }

    return usersToDelete.length;
}

export function summarizeRevenueCatEventUserState(
    eventDoc: Pick<
        Doc<"revenue_cat_events">,
        "app_user_id" | "original_app_user_id" | "aliases" | "transferred_from" | "transferred_to"
    >,
    eventUsers: Pick<Doc<"revenue_cat_event_users">, "user_id" | "status">[]
) {
    return summarizeRevenueCatEventUsers({
        resolved_target_user_ids: resolveTargetUserIdsFromRevenueCatEvent(eventDoc),
        links: eventUsers.map((eventUser) => ({
            user_id: eventUser.user_id,
            status: eventUser.status,
        })),
    });
}
