import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { pruneRevenueCatEventUserReferences } from "../../model/subscriptions/revenueCatEventUsers";
import { resolveRevenueCatWebhookTargetUserIds as resolveTargetUserIdsFromRevenueCatEvent } from "../../model/subscriptions/revenueCatWebhookIngestion";
import {
    deleteRevenueCatEventUsersByEventDocId,
    listRevenueCatEventUsersByEventDocId,
    listRevenueCatEventUsersByUserIdBatch,
    summarizeRevenueCatEventUserState,
} from "./revenueCatEventUserDocuments";

type DbReaderCtx = Pick<MutationCtx, "db"> | Pick<QueryCtx, "db">;
type DbWriterCtx = Pick<MutationCtx, "db">;

export async function deleteOrPruneRevenueCatEventForDeletedUser(
    ctx: DbWriterCtx,
    args: {
        event_doc: Doc<"revenue_cat_events">;
        user_id: string;
        now_ms: number;
    }
) {
    const linkedEventUsers = await listRevenueCatEventUsersByEventDocId(ctx, args.event_doc._id);
    const userSummary = summarizeRevenueCatEventUserState(args.event_doc, linkedEventUsers);
    const eventTargetUserIds =
        userSummary.target_user_ids.length > 0
            ? userSummary.target_user_ids
            : resolveTargetUserIdsFromRevenueCatEvent(args.event_doc);
    const remainingUserIds = eventTargetUserIds.filter((userId) => userId !== args.user_id);

    if (remainingUserIds.length === 0) {
        await deleteRevenueCatEventUsersByEventDocId(ctx, args.event_doc._id, linkedEventUsers);
        await ctx.db.delete("revenue_cat_events", args.event_doc._id);

        return {
            deleted: true,
        };
    }

    for (const eventUser of linkedEventUsers) {
        if (eventUser.user_id !== args.user_id) {
            continue;
        }

        await ctx.db.delete("revenue_cat_event_users", eventUser._id);
    }

    await ctx.db.patch("revenue_cat_events", args.event_doc._id, {
        ...pruneRevenueCatEventUserReferences({
            removed_user_id: args.user_id,
            remaining_user_ids: remainingUserIds,
            app_user_id: args.event_doc.app_user_id,
            original_app_user_id: args.event_doc.original_app_user_id,
            aliases: args.event_doc.aliases,
            transferred_from: args.event_doc.transferred_from,
            transferred_to: args.event_doc.transferred_to,
            user_id: args.event_doc.user_id,
        }),
        payload: undefined,
        last_error: undefined,
        updated_at_ms: args.now_ms,
    });

    return {
        deleted: false,
    };
}

export async function listRevenueCatEventsForUserDeletionBatch(
    ctx: DbReaderCtx,
    args: {
        user_id: string;
        revenuecat_app_user_id?: string;
        limit: number;
    }
) {
    const safeLimit = Math.max(1, args.limit);
    const candidateAppUserIds = Array.from(
        new Set(
            [args.user_id, args.revenuecat_app_user_id].filter(
                (value): value is string => typeof value === "string" && value.length > 0
            )
        )
    );
    const eventsById = new Map<string, Doc<"revenue_cat_events">>();
    const addEvent = (eventDoc: Doc<"revenue_cat_events"> | null) => {
        if (!eventDoc || eventsById.size >= safeLimit) {
            return;
        }

        eventsById.set(String(eventDoc._id), eventDoc);
    };
    const eventUsers = await listRevenueCatEventUsersByUserIdBatch(ctx, args.user_id, safeLimit);

    const userIdEvents = await ctx.db
        .query("revenue_cat_events")
        .withIndex("by_user_id_and_event_at_ms", (query) => query.eq("user_id", args.user_id))
        .take(safeLimit);

    for (const eventDoc of userIdEvents) {
        addEvent(eventDoc);
    }

    for (const eventUser of eventUsers) {
        if (eventsById.size >= safeLimit) {
            break;
        }

        const eventDoc = await ctx.db.get("revenue_cat_events", eventUser.event_doc_id);
        addEvent(eventDoc);
    }

    for (const candidateAppUserId of candidateAppUserIds) {
        if (eventsById.size >= safeLimit) {
            break;
        }

        const [appUserEvents, originalAppUserEvents] = await Promise.all([
            ctx.db
                .query("revenue_cat_events")
                .withIndex("by_app_user_id_and_event_at_ms", (query) =>
                    query.eq("app_user_id", candidateAppUserId)
                )
                .take(safeLimit),
            ctx.db
                .query("revenue_cat_events")
                .withIndex("by_original_app_user_id_and_event_at_ms", (query) =>
                    query.eq("original_app_user_id", candidateAppUserId)
                )
                .take(safeLimit),
        ]);

        for (const eventDoc of [...appUserEvents, ...originalAppUserEvents]) {
            addEvent(eventDoc);
        }
    }

    return [...eventsById.values()];
}
