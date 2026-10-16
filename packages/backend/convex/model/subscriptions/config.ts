import { parseString } from "../valueParsing";

function readIntegerOverride(
    name: string,
    value: string | undefined,
    defaultValue: number,
    min: number,
    max: number,
) {
    if (value === undefined) return defaultValue;

    const parsed = value.trim() === "" ? NaN : Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
        throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
    return parsed;
}

export function getRevenueCatProjectId() {
    return parseString(process.env.REVENUECAT_PROJECT_ID) ?? "";
}

export function getPolyglotEntitlementId() {
    return parseString(process.env.REVENUECAT_POLYGLOT_ENTITLEMENT_ID) ?? "";
}

// Cache freshness, not a scheduled refresh. Zero always requests a fresh state;
// access expiration is checked separately. Cap at one day to bound staleness.
export function getOnDemandSubscriptionRefreshIntervalMs() {
    return readIntegerOverride(
        "REVENUECAT_ON_DEMAND_SYNC_AFTER_MS",
        process.env.REVENUECAT_ON_DEMAND_SYNC_AFTER_MS,
        8 * 60 * 60 * 1000,
        0,
        24 * 60 * 60 * 1000,
    );
}

// Throughput controls; these do not change the five-minute cron schedules.
export function getRetryBatchLimit() {
    return readIntegerOverride(
        "REVENUECAT_WEBHOOK_RETRY_BATCH_LIMIT",
        process.env.REVENUECAT_WEBHOOK_RETRY_BATCH_LIMIT,
        20, 1, 100,
    );
}

export function getReconciliationBatchLimit() {
    return readIntegerOverride(
        "REVENUECAT_RECONCILIATION_BATCH_LIMIT",
        process.env.REVENUECAT_RECONCILIATION_BATCH_LIMIT,
        10, 1, 50,
    );
}
