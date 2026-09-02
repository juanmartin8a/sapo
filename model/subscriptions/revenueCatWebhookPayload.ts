import {
    isRecord,
    parseIdentifierString,
    parseString,
    parseTimestampMs,
} from "../valueParsing";

export type RevenueCatWebhookPayload = {
    event?: Record<string, unknown>;
};

export type NormalizedRevenueCatWebhookEvent = {
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

export function safeJsonStringify(value: unknown): string | null {
    try {
        return JSON.stringify(value);
    } catch {
        return null;
    }
}

export function getRevenueCatWebhookCancelReasonFromRawPayload(rawPayload?: string) {
    if (!rawPayload) {
        return undefined;
    }

    try {
        const payload = JSON.parse(rawPayload) as unknown;
        if (!isRecord(payload)) {
            return undefined;
        }

        const rawEvent = isRecord(payload.event) ? payload.event : payload;
        return parseString(rawEvent.cancel_reason) ?? undefined;
    } catch {
        return undefined;
    }
}

export function normalizeRevenueCatWebhookEvent(
    payload: unknown,
    receivedAtMs: number
): NormalizedRevenueCatWebhookEvent | null {
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
