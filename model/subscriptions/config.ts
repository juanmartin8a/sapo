const DEFAULT_RETRY_BASE_DELAY_MS = 15_000;
const DEFAULT_MAX_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;
const DEFAULT_MAX_RETRY_COUNT = 12;
const DEFAULT_ON_DEMAND_SUBSCRIPTION_REFRESH_INTERVAL_MS = 8 * 60 * 60 * 1000;
const DEFAULT_RETRY_BATCH_LIMIT = 20;
const DEFAULT_RECONCILIATION_BATCH_LIMIT = 10;
const DEFAULT_RECONCILIATION_FAILURE_BACKOFF_MS = 30 * 60 * 1000;
const DEFAULT_FROZEN_QUOTA_PERIOD_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;
const DEFAULT_REVENUECAT_EVENTS_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const DEFAULT_OPERATIONAL_ALERTS_RESOLVED_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

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

function parsePositiveIntegerEnvValue(value: string | undefined, defaultValue: number) {
    const parsed = parseNumber(value);
    if (parsed === null || parsed <= 0) {
        return defaultValue;
    }

    return Math.floor(parsed);
}

export function getRevenueCatProjectId() {
    return parseString(process.env.REVENUECAT_PROJECT_ID) ?? "";
}

export function getPolyglotEntitlementId() {
    return parseString(process.env.REVENUECAT_POLYGLOT_ENTITLEMENT_ID) ?? "";
}

export function getOnDemandSubscriptionRefreshIntervalMs() {
    return parseIntegerEnvValue(
        process.env.REVENUECAT_ON_DEMAND_SYNC_AFTER_MS,
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

export function getFrozenQuotaPeriodRetentionMs() {
    return parseIntegerEnvValue(
        process.env.FROZEN_QUOTA_PERIOD_RETENTION_MS,
        DEFAULT_FROZEN_QUOTA_PERIOD_RETENTION_MS
    );
}

export function getRevenueCatEventsRetentionMs() {
    return parsePositiveIntegerEnvValue(
        process.env.REVENUECAT_EVENTS_RETENTION_MS,
        DEFAULT_REVENUECAT_EVENTS_RETENTION_MS
    );
}

export function getOperationalAlertsResolvedRetentionMs() {
    return parsePositiveIntegerEnvValue(
        process.env.OPERATIONAL_ALERTS_RESOLVED_RETENTION_MS,
        DEFAULT_OPERATIONAL_ALERTS_RESOLVED_RETENTION_MS
    );
}
