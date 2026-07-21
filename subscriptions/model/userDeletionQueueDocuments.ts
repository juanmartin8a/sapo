import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { UserDeletionCleanupStep, UserDeletionQueueStatus } from "../../model/subscriptions/userDeletionQueue";
import { MAX_PERSISTED_ERROR_MESSAGE_CHARS } from "../../constants/limits";

type DbReaderCtx = Pick<MutationCtx, "db"> | Pick<QueryCtx, "db">;

export type UserDeletionCleanupLeaseFields = {
    cleanup_attempt_id?: string;
    cleanup_step?: UserDeletionCleanupStep;
    cleanup_step_started_at_ms?: number;
    cleanup_lease_expires_at_ms?: number;
};

export type UserDeletionPersistentCleanupFields = {
    revenuecat_deleted_at_ms?: number;
};

export type UserDeletionQueueEntryDoc = Doc<"user_deletion_queue"> &
    UserDeletionCleanupLeaseFields &
    UserDeletionPersistentCleanupFields;

export type UserDeletionQueueEntryFields = Omit<
    Doc<"user_deletion_queue">,
    "_id" | "_creationTime"
> &
    UserDeletionCleanupLeaseFields &
    UserDeletionPersistentCleanupFields;

export async function listUserDeletionQueueEntriesByUserId(ctx: DbReaderCtx, userId: string) {
    return (await ctx.db
        .query("user_deletion_queue")
        .withIndex("by_user_id", (query) => query.eq("user_id", userId))
        .collect()) as UserDeletionQueueEntryDoc[];
}

export function getLatestUserDeletionQueueEntry(entries: UserDeletionQueueEntryDoc[]) {
    return (
        [...entries].sort((left, right) => {
            if (left.updated_at_ms !== right.updated_at_ms) {
                return right.updated_at_ms - left.updated_at_ms;
            }

            return right._creationTime - left._creationTime;
        })[0] ?? null
    );
}

export async function getLatestUserDeletionQueueEntryByUserId(ctx: DbReaderCtx, userId: string) {
    return getLatestUserDeletionQueueEntry(await listUserDeletionQueueEntriesByUserId(ctx, userId));
}

export function buildUserDeletionQueueEntry(args: {
    user_id: string;
    status: UserDeletionQueueStatus;
    started_at_ms: number;
    next_retry_at_ms: number;
    retry_count: number;
    updated_at_ms: number;
    prepared_at_ms?: number;
    auth_deleted_at_ms?: number;
    revenuecat_deleted_at_ms?: number;
    last_error?: string;
    cleanup_attempt_id?: string;
    cleanup_step?: UserDeletionCleanupStep;
    cleanup_step_started_at_ms?: number;
    cleanup_lease_expires_at_ms?: number;
    revenuecat_app_user_id?: string;
    has_active_subscription?: boolean;
    preserved_quota_period_id?: Doc<"user_deletion_queue">["preserved_quota_period_id"];
    store_subscription_id?: string;
    store_subscription_period_id?: string;
}): UserDeletionQueueEntryFields {
    return {
        user_id: args.user_id,
        status: args.status as UserDeletionQueueEntryFields["status"],
        started_at_ms: args.started_at_ms,
        ...(typeof args.prepared_at_ms === "number"
            ? { prepared_at_ms: args.prepared_at_ms }
            : {}),
        ...(typeof args.auth_deleted_at_ms === "number"
            ? { auth_deleted_at_ms: args.auth_deleted_at_ms }
            : {}),
        ...(typeof args.revenuecat_deleted_at_ms === "number"
            ? { revenuecat_deleted_at_ms: args.revenuecat_deleted_at_ms }
            : {}),
        next_retry_at_ms: args.next_retry_at_ms,
        retry_count: args.retry_count,
        ...(typeof args.last_error === "string"
            ? { last_error: args.last_error.slice(0, MAX_PERSISTED_ERROR_MESSAGE_CHARS) }
            : {}),
        ...(typeof args.cleanup_attempt_id === "string"
            ? { cleanup_attempt_id: args.cleanup_attempt_id }
            : {}),
        ...(typeof args.cleanup_step === "string" ? { cleanup_step: args.cleanup_step } : {}),
        ...(typeof args.cleanup_step_started_at_ms === "number"
            ? { cleanup_step_started_at_ms: args.cleanup_step_started_at_ms }
            : {}),
        ...(typeof args.cleanup_lease_expires_at_ms === "number"
            ? { cleanup_lease_expires_at_ms: args.cleanup_lease_expires_at_ms }
            : {}),
        ...(typeof args.revenuecat_app_user_id === "string"
            ? { revenuecat_app_user_id: args.revenuecat_app_user_id }
            : {}),
        ...(typeof args.has_active_subscription === "boolean"
            ? { has_active_subscription: args.has_active_subscription }
            : {}),
        ...(typeof args.preserved_quota_period_id !== "undefined"
            ? { preserved_quota_period_id: args.preserved_quota_period_id }
            : {}),
        ...(typeof args.store_subscription_id === "string"
            ? { store_subscription_id: args.store_subscription_id }
            : {}),
        ...(typeof args.store_subscription_period_id === "string"
            ? { store_subscription_period_id: args.store_subscription_period_id }
            : {}),
        updated_at_ms: args.updated_at_ms,
    };
}

export async function replaceUserDeletionQueueEntry(
    ctx: MutationCtx,
    userId: string,
    nextEntry: UserDeletionQueueEntryFields
) {
    const existingEntries = await listUserDeletionQueueEntriesByUserId(ctx, userId);
    const latestEntry = getLatestUserDeletionQueueEntry(existingEntries);
    const retainedEntryId = latestEntry
        ? latestEntry._id
        : await ctx.db.insert("user_deletion_queue", nextEntry);

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
        latest_entry: latestEntry,
        retained_entry_id: retainedEntryId,
    };
}
