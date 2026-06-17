import { afterEach, describe, expect, it, jest } from "@jest/globals";

import {
    deleteRevenueCatSubscriber,
    fetchRevenueCatSubscriberSnapshot,
    getRevenueCatApiErrorRetryDelayMs,
    isRevenueCatApiErrorWithStatus,
    RevenueCatApiError,
    shouldIgnoreStaleReconciledSubscriptionState,
} from "../revenueCatApi";

const originalEnv = process.env;
const originalFetch = globalThis.fetch;

function jsonResponse(status: number, payload: unknown, headers: Record<string, string> = {}) {
    const normalizedHeaders = new Map(
        Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
    );

    return {
        ok: status >= 200 && status < 300,
        status,
        headers: {
            get: (name: string) => normalizedHeaders.get(name.toLowerCase()) ?? null,
        },
        json: async () => payload,
    } as Response;
}

describe("RevenueCat API reconciliation", () => {
    afterEach(() => {
        process.env = originalEnv;
        globalThis.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    function configureRevenueCatEnv(extraEnv: Record<string, string | undefined> = {}) {
        process.env = {
            ...originalEnv,
            REVENUECAT_CI_SUBSCRIPTIONS_R_API_KEY: "rc_v2_secret",
            REVENUECAT_PROJECT_ID: "proj_test",
            REVENUECAT_POLYGLOT_ENTITLEMENT_ID: "polyglot",
            ...extraEnv,
        };
    }

    it("treats a missing RevenueCat customer as a free snapshot", async () => {
        configureRevenueCatEnv();
        globalThis.fetch = jest.fn(async () => jsonResponse(404, { type: "resource_missing" })) as typeof fetch;

        await expect(fetchRevenueCatSubscriberSnapshot("user_without_customer", Date.now()))
            .resolves.toEqual({
                has_active_subscription: false,
            });
    });

    it("does not use Expo public product ids as backend subscription filters", async () => {
        configureRevenueCatEnv({
            REVENUECAT_POLYGLOT_ENTITLEMENT_ID: undefined,
            EXPO_PUBLIC_REVENUE_CAT_ENTITLEMENT_ID: undefined,
            EXPO_PUBLIC_IOS_SUBSCRIPTION_PRODUCT_ID: "ios_public_product",
            EXPO_PUBLIC_ANDR_SUBSCRIPTION_PRODUCT_ID: "android_public_product",
        });
        const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;
        jest.spyOn(console, "error").mockImplementation(() => undefined);
        jest.spyOn(console, "warn").mockImplementation(() => undefined);

        await expect(fetchRevenueCatSubscriberSnapshot("user_with_public_product_ids", Date.now()))
            .resolves.toEqual({
                has_active_subscription: false,
            });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("matches configured entitlement lookup keys from RevenueCat v2", async () => {
        configureRevenueCatEnv();
        globalThis.fetch = jest.fn(async () => jsonResponse(200, {
            items: [
                {
                    id: "sub_test",
                    product_id: "prod_internal",
                    current_period_starts_at: 1_700_000_000_000,
                    current_period_ends_at: 1_800_000_000_000,
                    gives_access: true,
                    store_subscription_identifier: "txn_test",
                    store: "app_store",
                    environment: "sandbox",
                    entitlements: {
                        items: [
                            {
                                id: "entl_internal",
                                lookup_key: "polyglot",
                            },
                        ],
                    },
                },
            ],
        })) as typeof fetch;

        await expect(fetchRevenueCatSubscriberSnapshot("user_with_subscription", 1_750_000_000_000))
            .resolves.toMatchObject({
                has_active_subscription: true,
                entitlement_id: "polyglot",
                product_id: "prod_internal",
                store_subscription_id: "txn_test",
                period_start_at_ms: 1_700_000_000_000,
                period_end_at_ms: 1_800_000_000_000,
                store: "app_store",
                environment: "sandbox",
            });
    });

    it("ignores only older incoming reconciliation writes", () => {
        expect(
            shouldIgnoreStaleReconciledSubscriptionState(
                { last_synced_at_ms: 2_000 },
                1_000
            )
        ).toBe(true);

        expect(
            shouldIgnoreStaleReconciledSubscriptionState(
                { last_synced_at_ms: 1_000 },
                1_000
            )
        ).toBe(false);

        expect(
            shouldIgnoreStaleReconciledSubscriptionState(
                { last_synced_at_ms: 1_000 },
                2_000
            )
        ).toBe(false);

        expect(shouldIgnoreStaleReconciledSubscriptionState(null, 1_000)).toBe(false);
        expect(
            shouldIgnoreStaleReconciledSubscriptionState(
                { last_synced_at_ms: Number.POSITIVE_INFINITY },
                1_000
            )
        ).toBe(false);
    });

    it("deletes RevenueCat customers through v2 with the v2 delete key", async () => {
        configureRevenueCatEnv({
            REVENUECAT_CI_CUSTOMERS_RW_API_KEY: "rc_v2_delete_secret",
        });
        const fetchMock = jest.fn(async () => jsonResponse(200, {})) as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;

        await expect(deleteRevenueCatSubscriber("user/with space"))
            .resolves.toEqual({
                deleted: true,
            });

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(
            "https://api.revenuecat.com/v2/projects/proj_test/customers/user%2Fwith%20space"
        );
        expect(init).toMatchObject({
            method: "DELETE",
            headers: {
                Authorization: "Bearer rc_v2_delete_secret",
                Accept: "application/json",
            },
        });
    });

    it("treats a missing RevenueCat v2 customer as already deleted", async () => {
        configureRevenueCatEnv({
            REVENUECAT_CI_CUSTOMERS_RW_API_KEY: "rc_v2_delete_secret",
        });
        globalThis.fetch = jest.fn(async () => jsonResponse(404, { type: "resource_missing" })) as typeof fetch;

        await expect(deleteRevenueCatSubscriber("missing_user"))
            .resolves.toEqual({
                deleted: false,
                already_missing: true,
            });
    });

    it("requires the v2 customers RW key for RevenueCat customer deletion", async () => {
        configureRevenueCatEnv({
            REVENUECAT_CI_CUSTOMERS_RW_API_KEY: undefined,
        });
        const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;

        await expect(deleteRevenueCatSubscriber("configured_with_read_key_only"))
            .rejects.toThrow("Missing REVENUECAT_CI_CUSTOMERS_RW_API_KEY");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("exposes RevenueCat backoff_ms on retryable delete errors", async () => {
        configureRevenueCatEnv({
            REVENUECAT_CI_CUSTOMERS_RW_API_KEY: "rc_v2_delete_secret",
        });
        globalThis.fetch = jest.fn(async () => jsonResponse(429, {
            message: "Rate limited",
            backoff_ms: 2_500,
        })) as typeof fetch;

        try {
            await deleteRevenueCatSubscriber("rate_limited_user");
            throw new Error("Expected RevenueCat delete to fail");
        } catch (error) {
            expect(error).toBeInstanceOf(RevenueCatApiError);
            expect(error).toMatchObject({
                status: 429,
                retry_after_ms: 2_500,
            });
            expect(getRevenueCatApiErrorRetryDelayMs(error)).toBe(2_500);
            expect(isRevenueCatApiErrorWithStatus(error, [429])).toBe(true);
        }
    });

    it("parses Retry-After seconds from RevenueCat read errors", async () => {
        configureRevenueCatEnv();
        globalThis.fetch = jest.fn(async () => jsonResponse(
            429,
            { message: "Rate limited" },
            { "Retry-After": "3" }
        )) as typeof fetch;

        try {
            await fetchRevenueCatSubscriberSnapshot("rate_limited_user", Date.now());
            throw new Error("Expected RevenueCat read to fail");
        } catch (error) {
            expect(error).toBeInstanceOf(RevenueCatApiError);
            expect(error).toMatchObject({
                status: 429,
                retry_after_ms: 3_000,
            });
            expect(getRevenueCatApiErrorRetryDelayMs(error)).toBe(3_000);
        }
    });

    it("classifies permanent RevenueCat delete authorization errors", async () => {
        configureRevenueCatEnv({
            REVENUECAT_CI_CUSTOMERS_RW_API_KEY: "rc_v2_delete_secret",
        });
        globalThis.fetch = jest.fn(async () => jsonResponse(403, {
            message: "Forbidden",
        })) as typeof fetch;

        try {
            await deleteRevenueCatSubscriber("forbidden_user");
            throw new Error("Expected RevenueCat delete to fail");
        } catch (error) {
            expect(error).toBeInstanceOf(RevenueCatApiError);
            expect(error).toMatchObject({
                status: 403,
            });
            expect(getRevenueCatApiErrorRetryDelayMs(error)).toBeUndefined();
            expect(isRevenueCatApiErrorWithStatus(error, [401, 403, 422])).toBe(true);
        }
    });
});
