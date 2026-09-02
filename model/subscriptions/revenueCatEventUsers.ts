export type RevenueCatEventUserStatus = "pending" | "processed" | "ignored";

type RevenueCatEventUserLink = {
    user_id: string;
    status: RevenueCatEventUserStatus;
};

type RevenueCatEventUserFields = {
    app_user_id?: string;
    original_app_user_id?: string;
    aliases: string[];
    transferred_from: string[];
    transferred_to: string[];
    user_id?: string;
};

export function appendUniqueUserIds(targets: string[], candidates: string[]) {
    for (const candidate of candidates) {
        if (!targets.includes(candidate)) {
            targets.push(candidate);
        }
    }
}

export function summarizeRevenueCatEventUsers(args: {
    resolved_target_user_ids: string[];
    links: RevenueCatEventUserLink[];
}) {
    const orderedUserIds = [...args.resolved_target_user_ids];
    const linksByUserId = new Map(args.links.map((link) => [link.user_id, link.status]));

    appendUniqueUserIds(
        orderedUserIds,
        args.links.map((link) => link.user_id)
    );

    const pendingUserIds: string[] = [];
    const processedUserIds: string[] = [];
    const ignoredUserIds: string[] = [];

    for (const userId of orderedUserIds) {
        const status = linksByUserId.get(userId);

        if (status === "processed") {
            processedUserIds.push(userId);
            continue;
        }

        if (status === "ignored") {
            ignoredUserIds.push(userId);
            continue;
        }

        if (status === "pending") {
            pendingUserIds.push(userId);
        }
    }

    return {
        target_user_ids: orderedUserIds,
        pending_user_ids: pendingUserIds,
        processed_user_ids: processedUserIds,
        ignored_user_ids: ignoredUserIds,
    };
}

export function pruneRevenueCatEventUserReferences(
    args: RevenueCatEventUserFields & {
        removed_user_id: string;
        remaining_user_ids: string[];
    }
) {
    return {
        app_user_id:
            args.app_user_id === args.removed_user_id ? undefined : args.app_user_id,
        original_app_user_id:
            args.original_app_user_id === args.removed_user_id
                ? undefined
                : args.original_app_user_id,
        aliases: args.aliases.filter((userId) => userId !== args.removed_user_id),
        transferred_from: args.transferred_from.filter((userId) => userId !== args.removed_user_id),
        transferred_to: args.transferred_to.filter((userId) => userId !== args.removed_user_id),
        user_id: args.remaining_user_ids.includes(args.user_id ?? "")
            ? args.user_id
            : args.remaining_user_ids[0],
    };
}

export function filterRevenueCatEventUserReferences(
    args: RevenueCatEventUserFields & {
        allowed_user_ids: string[];
    }
) {
    const allowedUserIds = new Set(args.allowed_user_ids);

    return {
        app_user_id: allowedUserIds.has(args.app_user_id ?? "") ? args.app_user_id : undefined,
        original_app_user_id: allowedUserIds.has(args.original_app_user_id ?? "")
            ? args.original_app_user_id
            : undefined,
        aliases: args.aliases.filter((userId) => allowedUserIds.has(userId)),
        transferred_from: args.transferred_from.filter((userId) => allowedUserIds.has(userId)),
        transferred_to: args.transferred_to.filter((userId) => allowedUserIds.has(userId)),
        user_id: allowedUserIds.has(args.user_id ?? "") ? args.user_id : args.allowed_user_ids[0],
    };
}
