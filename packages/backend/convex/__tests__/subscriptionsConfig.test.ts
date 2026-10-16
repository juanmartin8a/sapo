import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import {
    getOnDemandSubscriptionRefreshIntervalMs,
    getPolyglotEntitlementId,
    getRetryBatchLimit,
    getReconciliationBatchLimit,
} from "../model/subscriptions/config";
import { getEmailTestMode } from "../model/emailConfig";

const originalEnv = process.env;
const overrides = [
    ["REVENUECAT_ON_DEMAND_SYNC_AFTER_MS", getOnDemandSubscriptionRefreshIntervalMs, 28_800_000, 0, 86_400_000],
    ["REVENUECAT_WEBHOOK_RETRY_BATCH_LIMIT", getRetryBatchLimit, 20, 1, 100],
    ["REVENUECAT_RECONCILIATION_BATCH_LIMIT", getReconciliationBatchLimit, 10, 1, 50],
] as const;

beforeEach(() => {
    process.env = { ...originalEnv };
    for (const [name] of overrides) delete process.env[name];
    delete process.env.EMAIL_TEST_MODE;
});
afterEach(() => { process.env = originalEnv; });

for (const [name, read, defaultValue, min, max] of overrides) {
    describe(name, () => {
        it("uses the default only when absent", () => {
            expect(read()).toBe(defaultValue);
        });
        it.each([min, max])("accepts boundary %s", (value) => {
            process.env[name] = String(value);
            expect(read()).toBe(value);
        });
        it.each(["", " ", "nope", "NaN", "Infinity", "0.5", String(min - 1), String(max + 1)])(
            "rejects invalid override %s with its name", (value) => {
                process.env[name] = value;
                expect(read).toThrow(name);
            }
        );
        it("reads updated overrides on each call", () => {
            process.env[name] = String(min);
            expect(read()).toBe(min);
            process.env[name] = String(max);
            expect(read()).toBe(max);
        });
    });
}

it("reads the generated Polyglot entitlement resource id", () => {
    process.env.REVENUECAT_POLYGLOT_ENTITLEMENT_ID = " entl_polyglot ";
    expect(getPolyglotEntitlementId()).toBe("entl_polyglot");
});

it("defaults to live email sending and accepts explicit modes", () => {
    expect(getEmailTestMode()).toBe(false);
    process.env.EMAIL_TEST_MODE = "true";
    expect(getEmailTestMode()).toBe(true);
    process.env.EMAIL_TEST_MODE = "false";
    expect(getEmailTestMode()).toBe(false);
});
it("rejects invalid email modes", () => {
    process.env.EMAIL_TEST_MODE = "yes";
    expect(getEmailTestMode).toThrow("EMAIL_TEST_MODE");
});
