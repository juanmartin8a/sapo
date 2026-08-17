import { afterEach, describe, expect, it } from "@jest/globals";

import {
    getOnDemandSubscriptionRefreshIntervalMs,
    getOperationalAlertsResolvedRetentionMs,
    getPolyglotProductIds,
    getRevenueCatEventsRetentionMs,
    getSubscriptionProcessingConfig,
    hasPolyglotSubscriptionFilters,
} from "../model/subscriptions/config";

const originalEnv = process.env;

function configureEnv(extraEnv: Record<string, string | undefined> = {}) {
    process.env = {
        ...originalEnv,
        EXPO_PUBLIC_REVENUE_CAT_ENTITLEMENT_ID: undefined,
        REVENUECAT_POLYGLOT_ENTITLEMENT_ID: undefined,
        REVENUECAT_POLYGLOT_PRODUCT_ID: undefined,
        REVENUECAT_POLYGLOT_PRODUCT_IDS: undefined,
        EXPO_PUBLIC_IOS_SUBSCRIPTION_PRODUCT_ID: undefined,
        EXPO_PUBLIC_ANDR_SUBSCRIPTION_PRODUCT_ID: undefined,
        REVENUECAT_EXP_RECONCILIATION_DELAY_MS: undefined,
        REVENUECAT_ON_DEMAND_SYNC_AFTER_MS: undefined,
        REVENUECAT_EVENTS_RETENTION_MS: undefined,
        OPERATIONAL_ALERTS_RESOLVED_RETENTION_MS: undefined,
        ...extraEnv,
    };
}

describe("subscription processing config", () => {
    afterEach(() => {
        process.env = originalEnv;
    });

    it("uses the shortened RevenueCat expiration reconciliation delay key", () => {
        configureEnv({
            REVENUECAT_EXP_RECONCILIATION_DELAY_MS: "1800000",
        });

        expect(getSubscriptionProcessingConfig()).toEqual({
            expiration_reconciliation_delay_ms: 1_800_000,
        });
    });

    it("falls back to a 15 minute expiration reconciliation delay", () => {
        configureEnv();

        expect(getSubscriptionProcessingConfig()).toEqual({
            expiration_reconciliation_delay_ms: 15 * 60 * 1000,
        });
    });

    it("uses the RevenueCat on-demand sync interval as milliseconds", () => {
        configureEnv({
            REVENUECAT_ON_DEMAND_SYNC_AFTER_MS: "12345",
        });

        expect(getOnDemandSubscriptionRefreshIntervalMs()).toBe(12_345);
    });

    it("uses the RevenueCat events retention env var as milliseconds", () => {
        configureEnv({
            REVENUECAT_EVENTS_RETENTION_MS: "300000",
        });

        expect(getRevenueCatEventsRetentionMs()).toBe(300_000);
    });

    it("defaults RevenueCat events retention to 90 days", () => {
        configureEnv();

        expect(getRevenueCatEventsRetentionMs()).toBe(90 * 24 * 60 * 60 * 1000);
    });

    it("falls back to default RevenueCat events retention for invalid values", () => {
        configureEnv({
            REVENUECAT_EVENTS_RETENTION_MS: "0",
        });

        expect(getRevenueCatEventsRetentionMs()).toBe(90 * 24 * 60 * 60 * 1000);
    });

    it("defaults resolved alerts retention", () => {
        configureEnv();

        expect(getOperationalAlertsResolvedRetentionMs()).toBe(90 * 24 * 60 * 60 * 1000);
    });

    it("uses configured RevenueCat product IDs as subscription filters", () => {
        configureEnv({
            REVENUECAT_POLYGLOT_PRODUCT_IDS: "ios_polyglot, android_polyglot",
            EXPO_PUBLIC_IOS_SUBSCRIPTION_PRODUCT_ID: "ios_polyglot",
        });

        expect(getPolyglotProductIds()).toEqual(["ios_polyglot", "android_polyglot"]);
        expect(hasPolyglotSubscriptionFilters()).toBe(true);
    });
});
