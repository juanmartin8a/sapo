import { afterEach, describe, expect, it } from "@jest/globals";

import {
    getOnDemandSubscriptionRefreshIntervalMs,
    getOperationalAlertsResolvedRetentionMs,
    getPolyglotEntitlementId,
    getRevenueCatEventsRetentionMs,
} from "../model/subscriptions/config";

const originalEnv = process.env;

function configureEnv(extraEnv: Record<string, string | undefined> = {}) {
    process.env = {
        ...originalEnv,
        REVENUECAT_POLYGLOT_ENTITLEMENT_ID: undefined,
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

    it("uses the RevenueCat on-demand sync interval as milliseconds", () => {
        configureEnv({
            REVENUECAT_ON_DEMAND_SYNC_AFTER_MS: "12345",
        });

        expect(getOnDemandSubscriptionRefreshIntervalMs()).toBe(12_345);
    });

    it("reads the generated Polyglot entitlement resource id", () => {
        configureEnv({
            REVENUECAT_POLYGLOT_ENTITLEMENT_ID: " entl_polyglot ",
        });

        expect(getPolyglotEntitlementId()).toBe("entl_polyglot");
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
});
