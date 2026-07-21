import { filterRevenueCatEventUserReferences } from "./revenueCatEventUsers";
import type { NormalizedRevenueCatWebhookEvent } from "./revenueCatWebhookPayload";

const REVENUECAT_GENERATED_ID_PREFIX = "$RCAnonymousID:";

type RevenueCatWebhookUserReferenceEvent = {
    app_user_id?: string;
    original_app_user_id?: string;
    aliases?: string[];
    transferred_from?: string[];
    transferred_to?: string[];
};

export type RevenueCatWebhookEventForIngestion = NormalizedRevenueCatWebhookEvent & {
    user_id?: string;
};

export function isRevenueCatGeneratedAppUserId(value: string) {
    return value.startsWith(REVENUECAT_GENERATED_ID_PREFIX);
}

function appendUniqueUserIds(targets: string[], candidates: string[]) {
    for (const candidate of candidates) {
        if (!targets.includes(candidate)) {
            targets.push(candidate);
        }
    }
}

export function resolveRevenueCatWebhookTargetUserIds(event: RevenueCatWebhookUserReferenceEvent) {
    const targetUserIds: string[] = [];

    appendUniqueUserIds(
        targetUserIds,
        (event.transferred_to ?? []).filter(
            (candidate): candidate is string => !isRevenueCatGeneratedAppUserId(candidate)
        )
    );
    appendUniqueUserIds(
        targetUserIds,
        (event.transferred_from ?? []).filter(
            (candidate): candidate is string => !isRevenueCatGeneratedAppUserId(candidate)
        )
    );
    appendUniqueUserIds(
        targetUserIds,
        [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])].filter(
            (candidate): candidate is string =>
                typeof candidate === "string" &&
                candidate.trim().length > 0 &&
                !isRevenueCatGeneratedAppUserId(candidate)
        )
    );

    return targetUserIds;
}

export function normalizeRevenueCatWebhookUserIds(userIds: string[]) {
    const normalizedUserIds: string[] = [];

    appendUniqueUserIds(
        normalizedUserIds,
        userIds.filter(
            (userId): userId is string => typeof userId === "string" && userId.trim().length > 0
        )
    );

    return normalizedUserIds;
}

export function shouldSkipRevenueCatWebhookIngestion(args: {
    candidate_user_ids: string[];
    eligible_user_ids: string[];
}) {
    return args.candidate_user_ids.length > 0 && args.eligible_user_ids.length === 0;
}

export function shouldPersistRevenueCatWebhookRawPayload(args: {
    candidate_user_ids: string[];
    eligible_user_ids: string[];
}) {
    return args.candidate_user_ids.length === args.eligible_user_ids.length;
}

export function buildRevenueCatWebhookEventForIngestion(
    normalizedEvent: NormalizedRevenueCatWebhookEvent,
    eligibleUserIds: string[]
): RevenueCatWebhookEventForIngestion {
    const candidateUserIds = resolveRevenueCatWebhookTargetUserIds(normalizedEvent);

    if (candidateUserIds.length === 0 || candidateUserIds.length === eligibleUserIds.length) {
        return normalizedEvent;
    }

    return {
        ...normalizedEvent,
        ...filterRevenueCatEventUserReferences({
            ...normalizedEvent,
            allowed_user_ids: eligibleUserIds,
            user_id: candidateUserIds[0],
        }),
    };
}
