import { components, internal } from "./_generated/api";
import { httpAction, type ActionCtx } from "./_generated/server";

import { parseString } from "./subscriptionsConfig";

const ANONYMOUS_REVENUECAT_ID_PREFIX = "$RCAnonymousID:";

type RevenueCatWebhookPayload = {
    event?: Record<string, unknown>;
};

type NormalizedWebhookEvent = {
    event_id: string;
    event_type: string;
    event_at_ms: number;
    app_user_id?: string;
    original_app_user_id?: string;
    aliases: string[];
    transferred_from: string[];
    transferred_to: string[];
    entitlement_ids: string[];
    product_id?: string;
    transaction_id?: string;
    store?: string;
    environment?: string;
    expiration_at_ms?: number;
    grace_period_expiration_at_ms?: number;
    purchased_at_ms?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function parseNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return null;
}

function parseTimestampMs(value: unknown): number | null {
    const numberTimestamp = parseNumber(value);
    if (numberTimestamp !== null) {
        return numberTimestamp;
    }

    if (typeof value !== "string" || value.trim().length === 0) {
        return null;
    }

    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
        return null;
    }

    return parsed;
}

function parseStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const parsedValues: string[] = [];

    for (const item of value) {
        const parsed = parseString(item);
        if (parsed) {
            parsedValues.push(parsed);
        }
    }

    return parsedValues;
}

function parseIdentifierString(value: unknown) {
    const parsedString = parseString(value);

    if (parsedString) {
        return parsedString;
    }

    const parsedNumber = parseNumber(value);
    return parsedNumber === null ? null : String(parsedNumber);
}

function normalizeBearerValue(value: string): string {
    return value.replace(/^Bearer\s+/i, "").trim();
}

function isAnonymousRevenueCatAppUserId(value: string) {
    return value.startsWith(ANONYMOUS_REVENUECAT_ID_PREFIX);
}

function appendUniqueUserIds(targets: string[], candidates: string[]) {
    for (const candidate of candidates) {
        if (!targets.includes(candidate)) {
            targets.push(candidate);
        }
    }
}

export function resolveRevenueCatWebhookTargetUserIds(event: Pick<
    NormalizedWebhookEvent,
    "app_user_id" | "original_app_user_id" | "aliases" | "transferred_from" | "transferred_to"
>) {
    const targetUserIds: string[] = [];

    appendUniqueUserIds(
        targetUserIds,
        (event.transferred_to ?? []).filter(
            (candidate): candidate is string => !isAnonymousRevenueCatAppUserId(candidate)
        )
    );
    appendUniqueUserIds(
        targetUserIds,
        (event.transferred_from ?? []).filter(
            (candidate): candidate is string => !isAnonymousRevenueCatAppUserId(candidate)
        )
    );
    appendUniqueUserIds(
        targetUserIds,
        [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])].filter(
            (candidate): candidate is string =>
                typeof candidate === "string" &&
                candidate.trim().length > 0 &&
                !isAnonymousRevenueCatAppUserId(candidate)
        )
    );

    return targetUserIds;
}

export function shouldSkipRevenueCatWebhookIngestion(args: {
    candidate_user_ids: string[];
    eligible_user_ids: string[];
}) {
    return args.candidate_user_ids.length > 0 && args.eligible_user_ids.length === 0;
}

function safeJsonStringify(value: unknown): string | null {
    try {
        return JSON.stringify(value);
    } catch {
        return null;
    }
}

function formatErrorMessage(error: unknown): string {
    if (typeof error === "object" && error && "message" in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === "string" && message.trim().length > 0) {
            return message.slice(0, 400);
        }
    }

    return "Unknown error";
}

function getWebhookResponseHeaders() {
    return new Headers({
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
}

function jsonResponse(status: number, payload: Record<string, unknown>) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: getWebhookResponseHeaders(),
    });
}

function isAuthorizedRevenueCatWebhookRequest(request: Request) {
    const expectedSecret = parseString(process.env.REVENUECAT_WEBHOOK_AUTH_SECRET);

    if (!expectedSecret) {
        return false;
    }

    const rawAuthorizationHeader = request.headers.get("authorization");
    if (!rawAuthorizationHeader) {
        return false;
    }

    return (
        normalizeBearerValue(rawAuthorizationHeader) === normalizeBearerValue(expectedSecret)
    );
}

function normalizeRevenueCatWebhookEvent(
    payload: unknown,
    receivedAtMs: number
): NormalizedWebhookEvent | null {
    if (!isRecord(payload)) {
        return null;
    }

    const typedPayload = payload as RevenueCatWebhookPayload;
    const rawEvent = isRecord(typedPayload.event)
        ? typedPayload.event
        : isRecord(payload)
          ? payload
          : null;

    if (!rawEvent) {
        return null;
    }

    const eventId = parseString(rawEvent.id);
    if (!eventId) {
        return null;
    }

    const eventType = parseString(rawEvent.type) ?? "UNKNOWN";
    const eventAtMs = parseTimestampMs(rawEvent.event_timestamp_ms) ?? receivedAtMs;

    const appUserId = parseString(rawEvent.app_user_id) ?? undefined;
    const originalAppUserId = parseString(rawEvent.original_app_user_id) ?? undefined;
    const aliases = parseStringArray(rawEvent.aliases);
    const transferredFrom = parseStringArray(rawEvent.transferred_from);
    const transferredTo = parseStringArray(rawEvent.transferred_to);

    const entitlementIds = parseStringArray(rawEvent.entitlement_ids);
    const productId = parseString(rawEvent.product_id) ?? undefined;
    const transactionId = parseIdentifierString(rawEvent.transaction_id) ?? undefined;
    const store = parseString(rawEvent.store) ?? undefined;
    const environment = parseString(rawEvent.environment) ?? undefined;
    const expirationAtMs = parseTimestampMs(rawEvent.expiration_at_ms) ?? undefined;
    const gracePeriodExpirationAtMs =
        parseTimestampMs(rawEvent.grace_period_expiration_at_ms) ?? undefined;
    const purchasedAtMs = parseTimestampMs(rawEvent.purchased_at_ms) ?? undefined;

    return {
        event_id: eventId,
        event_type: eventType,
        event_at_ms: eventAtMs,
        app_user_id: appUserId,
        original_app_user_id: originalAppUserId,
        aliases,
        transferred_from: transferredFrom,
        transferred_to: transferredTo,
        entitlement_ids: entitlementIds,
        product_id: productId,
        transaction_id: transactionId,
        store,
        environment,
        expiration_at_ms: expirationAtMs,
        grace_period_expiration_at_ms: gracePeriodExpirationAtMs,
        purchased_at_ms: purchasedAtMs,
    };
}

async function resolveEligibleRevenueCatWebhookUserIds(
    ctx: ActionCtx,
    normalizedEvent: NormalizedWebhookEvent
) {
    const candidateUserIds = resolveRevenueCatWebhookTargetUserIds(normalizedEvent);

    if (candidateUserIds.length === 0) {
        return {
            candidate_user_ids: candidateUserIds,
            eligible_user_ids: [] as string[],
        };
    }

    const eligibleUserIds = (
        await Promise.all(
            candidateUserIds.map(async (userId) => {
                const [user, deletionState] = await Promise.all([
                    (ctx as any).runQuery(components.betterAuth.adapter.findOne, {
                        model: "user",
                        where: [{ field: "_id", value: userId }],
                    }) as Promise<{ _id: string } | null>,
                    (ctx as any).runQuery(
                        (components.subscriptions.webhook as Record<string, unknown>)
                            .getUserDeletionOperationState,
                        {
                            user_id: userId,
                        }
                    ) as Promise<{ in_progress: boolean }>,
                ]);

                if (!user || deletionState.in_progress) {
                    return null;
                }

                return userId;
            })
        )
    ).filter((userId): userId is string => typeof userId === "string");

    return {
        candidate_user_ids: candidateUserIds,
        eligible_user_ids: eligibleUserIds,
    };
}

export const revenueCatWebhookOptions = httpAction(async () => {
    return new Response(null, {
        status: 204,
        headers: getWebhookResponseHeaders(),
    });
});

export const revenueCatWebhook = httpAction(async (ctx, request) => {
    if (request.method !== "POST") {
        return jsonResponse(405, {
            ok: false,
            error: "Method not allowed",
        });
    }

    if (!isAuthorizedRevenueCatWebhookRequest(request)) {
        return jsonResponse(401, {
            ok: false,
            error: "Unauthorized webhook",
        });
    }

    let payload: unknown;

    try {
        payload = await request.json();
    } catch {
        return jsonResponse(400, {
            ok: false,
            error: "Invalid JSON payload",
        });
    }

    const receivedAtMs = Date.now();
    const normalizedEvent = normalizeRevenueCatWebhookEvent(payload, receivedAtMs);

    if (!normalizedEvent) {
        return jsonResponse(400, {
            ok: false,
            error: "Invalid RevenueCat event payload",
        });
    }

    const eligibleUserIdsResult = await resolveEligibleRevenueCatWebhookUserIds(ctx, normalizedEvent);

    if (shouldSkipRevenueCatWebhookIngestion(eligibleUserIdsResult)) {
        console.info(
            JSON.stringify({
                event: "revenuecat_webhook_skipped_for_deleted_or_missing_users",
                event_id: normalizedEvent.event_id,
                candidate_user_ids: eligibleUserIdsResult.candidate_user_ids,
            })
        );

        return jsonResponse(200, {
            ok: true,
            skipped: true,
        });
    }

    const rawPayload = safeJsonStringify(payload) ?? undefined;
    const ingestionArgs = {
        normalized_event: normalizedEvent,
        received_at_ms: receivedAtMs,
        ...(typeof rawPayload === "string" ? { raw_payload: rawPayload } : {}),
    };

    let ingestionEventDocId: string;
    try {
        ingestionEventDocId = (
            await ctx.runMutation(components.subscriptions.webhook.ingestRevenueCatEvent, ingestionArgs)
        ).event_doc_id;
    } catch (error) {
        if (formatErrorMessage(error) === "Cannot ingest RevenueCat event while user deletion is in progress") {
            console.info(
                JSON.stringify({
                    event: "revenuecat_webhook_skipped_during_active_deletion",
                    event_id: normalizedEvent.event_id,
                    candidate_user_ids: eligibleUserIdsResult.candidate_user_ids,
                })
            );

            return jsonResponse(200, {
                ok: true,
                skipped: true,
            });
        }

        throw error;
    }

    try {
        await ctx.scheduler.runAfter(0, internal.subscriptionsWorkers.processRevenueCatWebhookEvent, {
            event_doc_id: ingestionEventDocId,
        });
    } catch (error) {
        console.warn(
            JSON.stringify({
                event: "revenuecat_webhook_schedule_failed",
                event_id: normalizedEvent.event_id,
                error: formatErrorMessage(error),
            })
        );
    }

    return jsonResponse(200, {
        ok: true,
    });
});
