const DEFAULT_RETRY_BASE_DELAY_MS = 15_000;
const DEFAULT_MAX_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;
const DEFAULT_MAX_RETRY_COUNT = 12;
const DEFAULT_ON_DEMAND_SUBSCRIPTION_REFRESH_INTERVAL_MS = 8 * 60 * 60 * 1000;
const DEFAULT_EXPIRATION_RECONCILIATION_DELAY_MS = 12 * 60 * 60 * 1000;
const DEFAULT_RETRY_BATCH_LIMIT = 20;
const DEFAULT_RECONCILIATION_BATCH_LIMIT = 10;
const DEFAULT_RECONCILIATION_FAILURE_BACKOFF_MS = 30 * 60 * 1000;

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

export function parseString(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function parseIntegerEnvValue(value: string | undefined, defaultValue: number) {
    const parsed = parseNumber(value);
    if (parsed === null || parsed < 0) {
        return defaultValue;
    }

    return Math.floor(parsed);
}

export function getPolyglotEntitlementId() {
    return (
        parseString(process.env.REVENUECAT_POLYGLOT_ENTITLEMENT_ID) ??
        parseString(process.env.EXPO_PUBLIC_REVENUE_CAT_ENTITLEMENT_ID) ??
        ""
    );
}

export function getRevenueCatProjectId() {
    return parseString(process.env.REVENUECAT_PROJECT_ID) ?? "";
}

export function getPolyglotProductIds() {
    const configured =
        parseString(process.env.REVENUECAT_POLYGLOT_PRODUCT_IDS)
            ?.split(",")
            .map((value) => value.trim())
            .filter((value) => value.length > 0) ?? [];

    const iosFallback = parseString(process.env.EXPO_PUBLIC_IOS_SUBSCRIPTION_PRODUCT_ID);
    const androidFallback = parseString(process.env.EXPO_PUBLIC_ANDROID_SUBSCRIPTION_PRODUCT_ID);

    if (iosFallback) {
        configured.push(iosFallback);
    }

    if (androidFallback) {
        configured.push(androidFallback);
    }

    return Array.from(new Set(configured));
}

export function getSubscriptionProcessingConfig() {
    const polyglotEntitlementId = getPolyglotEntitlementId();

    return {
        ...(polyglotEntitlementId.length > 0
            ? { polyglot_entitlement_id: polyglotEntitlementId }
            : {}),
        polyglot_product_ids: getPolyglotProductIds(),
        expiration_reconciliation_delay_ms: parseIntegerEnvValue(
            process.env.REVENUECAT_EXPIRATION_RECONCILIATION_DELAY_MS,
            DEFAULT_EXPIRATION_RECONCILIATION_DELAY_MS
        ),
    };
}

export function getOnDemandSubscriptionRefreshIntervalMs() {
    return parseIntegerEnvValue(
        process.env.REVENUECAT_ON_DEMAND_RECONCILIATION_AFTER_MS,
        DEFAULT_ON_DEMAND_SUBSCRIPTION_REFRESH_INTERVAL_MS
    );
}

export function getWebhookRetryConfig() {
    return {
        max_retry_count: parseIntegerEnvValue(
            process.env.REVENUECAT_WEBHOOK_MAX_RETRY_COUNT,
            DEFAULT_MAX_RETRY_COUNT
        ),
        retry_base_delay_ms: parseIntegerEnvValue(
            process.env.REVENUECAT_WEBHOOK_RETRY_BASE_DELAY_MS,
            DEFAULT_RETRY_BASE_DELAY_MS
        ),
        retry_max_delay_ms: parseIntegerEnvValue(
            process.env.REVENUECAT_WEBHOOK_MAX_RETRY_DELAY_MS,
            DEFAULT_MAX_RETRY_DELAY_MS
        ),
    };
}

export function getRetryBatchLimit() {
    const configured = parseIntegerEnvValue(
        process.env.REVENUECAT_WEBHOOK_RETRY_BATCH_LIMIT,
        DEFAULT_RETRY_BATCH_LIMIT
    );
    return Math.max(1, Math.min(configured, 100));
}

export function getReconciliationBatchLimit() {
    const configured = parseIntegerEnvValue(
        process.env.REVENUECAT_RECONCILIATION_BATCH_LIMIT,
        DEFAULT_RECONCILIATION_BATCH_LIMIT
    );
    return Math.max(1, Math.min(configured, 50));
}

export function getReconciliationFailureBackoffMs() {
    return parseIntegerEnvValue(
        process.env.REVENUECAT_RECONCILIATION_FAILURE_BACKOFF_MS,
        DEFAULT_RECONCILIATION_FAILURE_BACKOFF_MS
    );
}
