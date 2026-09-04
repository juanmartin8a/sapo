import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { SUBSCRIPTION_RENEWAL_PROPAGATION_GRACE_MS } from "../constants/subscriptions";
import {
    deleteRevenueCatCustomer,
    fetchRevenueCatCustomerActiveEntitlementSnapshot,
    fetchRevenueCatCustomerSubscriptionSnapshot,
    getRevenueCatApiErrorRetryDelayMs,
    hasUnexpiredSubscriptionAccess,
    isRevenueCatApiErrorWithStatus,
    RevenueCatApiError,
    resolveRevenueCatAccessExpirationAtMs,
    shouldIgnoreStaleReconciledSubscriptionState,
} from "../model/subscriptions/revenueCatApi";

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
            REVENUECAT_POLYGLOT_ENTITLEMENT_ID: "entl_polyglot",
            ...extraEnv,
        };
    }

    it("treats a missing RevenueCat customer as an inactive entitlement snapshot", async () => {
        configureRevenueCatEnv();
        globalThis.fetch = jest.fn(async () => jsonResponse(404, {
            type: "resource_missing",
        })) as typeof fetch;

        await expect(fetchRevenueCatCustomerActiveEntitlementSnapshot("user_without_customer"))
            .resolves.toEqual({
                has_active_subscription: false,
            });
    });

    it("reads encoded customers from the RevenueCat v2 active entitlements endpoint", async () => {
        configureRevenueCatEnv();
        const fetchMock = jest.fn(async () => jsonResponse(200, { items: [] })) as jest.MockedFunction<
            typeof fetch
        >;
        globalThis.fetch = fetchMock;

        await fetchRevenueCatCustomerActiveEntitlementSnapshot("user/with space");

        expect(fetchMock).toHaveBeenCalledWith(
            "https://api.revenuecat.com/v2/projects/proj_test/customers/user%2Fwith%20space/active_entitlements?limit=100",
            expect.objectContaining({
                method: "GET",
                headers: {
                    Authorization: "Bearer rc_v2_secret",
                    Accept: "application/json",
                },
            })
        );
    });

    it("matches the configured Polyglot entitlement resource id", async () => {
        configureRevenueCatEnv();
        const fetchMock = jest.fn(async () => jsonResponse(200, {
            items: [{
                entitlement_id: "entl_polyglot",
                expires_at: 1_810_000_000_000,
            }],
        })) as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;

        await expect(fetchRevenueCatCustomerActiveEntitlementSnapshot("user_with_subscription"))
            .resolves.toEqual({
                has_active_subscription: true,
                entitlement_id: "entl_polyglot",
                access_expires_at_ms: 1_810_000_000_000,
            });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not treat another active entitlement as polyglot access", async () => {
        configureRevenueCatEnv();
        const fetchMock = jest.fn(async () => jsonResponse(200, {
            items: [{ entitlement_id: "entl_other", expires_at: 1_900_000_000_000 }],
        })) as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;

        await expect(fetchRevenueCatCustomerActiveEntitlementSnapshot("user_with_other_entitlement"))
            .resolves.toEqual({
                has_active_subscription: false,
            });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not trust an active entitlement after its expiration", async () => {
        configureRevenueCatEnv();
        jest.spyOn(Date, "now").mockReturnValue(2_000);
        globalThis.fetch = jest.fn(async () => jsonResponse(200, {
            items: [{ entitlement_id: "entl_polyglot", expires_at: 2_000 }],
        })) as typeof fetch;

        await expect(fetchRevenueCatCustomerActiveEntitlementSnapshot("user_with_expired_access"))
            .resolves.toEqual({
                has_active_subscription: false,
            });
    });

    it("uses access expiration ahead of the billing period end", () => {
        const graceState = {
            has_active_subscription: true,
            billing_cycle_end_at_ms: 2_000,
            access_expires_at_ms: 5_000,
        };

        expect(hasUnexpiredSubscriptionAccess(graceState, 3_000)).toBe(true);
        expect(hasUnexpiredSubscriptionAccess(graceState, 5_000)).toBe(true);
        expect(
            hasUnexpiredSubscriptionAccess(
                graceState,
                5_000 + SUBSCRIPTION_RENEWAL_PROPAGATION_GRACE_MS
            )
        ).toBe(false);
    });

    it("falls back to billing expiration for legacy subscription states", () => {
        const legacyState = {
            has_active_subscription: true,
            billing_cycle_end_at_ms: 2_000,
        };

        expect(hasUnexpiredSubscriptionAccess(legacyState, 1_999)).toBe(true);
        expect(hasUnexpiredSubscriptionAccess(legacyState, 2_000)).toBe(true);
        expect(
            hasUnexpiredSubscriptionAccess(
                legacyState,
                2_000 + SUBSCRIPTION_RENEWAL_PROPAGATION_GRACE_MS
            )
        ).toBe(false);
    });

    it("does not combine a new active entitlement with an old active billing period", () => {
        expect(
            resolveRevenueCatAccessExpirationAtMs({
                subscription_status: "active",
                period_end_at_ms: 2_000,
                entitlement_expires_at_ms: 5_000,
            })
        ).toBe(2_000);
    });

    it("uses entitlement expiration for an access-granting grace period", () => {
        expect(
            resolveRevenueCatAccessExpirationAtMs({
                subscription_status: "in_grace_period",
                period_end_at_ms: 2_000,
                entitlement_expires_at_ms: 5_000,
            })
        ).toBe(5_000);
    });

    it.each([
        fetchRevenueCatCustomerActiveEntitlementSnapshot,
        fetchRevenueCatCustomerSubscriptionSnapshot,
    ])("requires the generated Polyglot entitlement resource id for RevenueCat reads", async (readSnapshot) => {
        configureRevenueCatEnv({
            REVENUECAT_POLYGLOT_ENTITLEMENT_ID: undefined,
        });
        const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;

        await expect(readSnapshot("user_without_config"))
            .rejects.toThrow("Missing REVENUECAT_POLYGLOT_ENTITLEMENT_ID");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not fetch subscriptions when checking inactive entitlements", async () => {
        configureRevenueCatEnv();
        const fetchMock = jest.fn(async () => jsonResponse(200, {
            items: [],
            next_page: null,
        })) as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;

        await expect(fetchRevenueCatCustomerActiveEntitlementSnapshot("user_without_access"))
            .resolves.toEqual({
                has_active_subscription: false,
            });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("reads full subscription metadata without calling active entitlements", async () => {
        configureRevenueCatEnv();
        const fetchMock = jest.fn(async () => jsonResponse(200, {
            items: [{
                id: "sub_test",
                product_id: "prod_internal",
                current_period_starts_at: 1_700_000_000_000,
                current_period_ends_at: 1_800_000_000_000,
                gives_access: true,
                store_subscription_identifier: "txn_test",
                store: "app_store",
                environment: "sandbox",
                entitlements: {
                    items: [{ id: "entl_polyglot", lookup_key: "renamed-polyglot" }],
                },
            }],
        })) as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;

        await expect(fetchRevenueCatCustomerSubscriptionSnapshot("user_with_subscription"))
            .resolves.toEqual({
                has_active_subscription: true,
                entitlement_id: "entl_polyglot",
                product_id: "prod_internal",
                revenuecat_subscription_id: "sub_test",
                store_subscription_id: "txn_test",
                period_start_at_ms: 1_700_000_000_000,
                period_end_at_ms: 1_800_000_000_000,
                store: "app_store",
                environment: "sandbox",
            });
        expect(String(fetchMock.mock.calls[0][0])).toContain("/subscriptions?limit=100");
        expect(String(fetchMock.mock.calls[0][0])).not.toContain("/active_entitlements");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not use the original subscription start as the current period start", async () => {
        configureRevenueCatEnv();
        globalThis.fetch = jest.fn(async () => jsonResponse(200, {
            items: [{
                id: "sub_test",
                starts_at: 1_600_000_000_000,
                current_period_ends_at: 1_800_000_000_000,
                gives_access: true,
                entitlements: {
                    items: [{ id: "entl_polyglot" }],
                },
            }],
        })) as typeof fetch;

        await expect(fetchRevenueCatCustomerSubscriptionSnapshot("user_with_subscription"))
            .resolves.toEqual({
                has_active_subscription: true,
                entitlement_id: "entl_polyglot",
                revenuecat_subscription_id: "sub_test",
                period_end_at_ms: 1_800_000_000_000,
            });
    });

    it("uses the saved RevenueCat subscription resource directly", async () => {
        configureRevenueCatEnv();
        const fetchMock = jest.fn(async () => jsonResponse(200, {
            id: "sub_saved",
            customer_id: "user_with_subscription",
            product_id: "prod_internal",
            current_period_starts_at: 3_000,
            current_period_ends_at: 4_000,
            gives_access: true,
            status: "active",
            entitlements: { items: [{ id: "entl_polyglot" }] },
        })) as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;

        await expect(fetchRevenueCatCustomerSubscriptionSnapshot(
            "user_with_subscription",
            {
                revenuecat_subscription_id: "sub_saved",
                active_entitlement_snapshot: {
                    has_active_subscription: true,
                    access_expires_at_ms: 4_000,
                },
            }
        )).resolves.toMatchObject({
            has_active_subscription: true,
            revenuecat_subscription_id: "sub_saved",
            product_id: "prod_internal",
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0][0])).toContain(
            "/projects/proj_test/subscriptions/sub_saved"
        );
        expect(String(fetchMock.mock.calls[0][0])).not.toContain("/customers/");
    });

    it("uses the saved canonical customer id for aliased customer subscriptions", async () => {
        configureRevenueCatEnv();
        const fetchMock = jest.fn(async () => jsonResponse(200, {
            id: "sub_saved",
            customer_id: "canonical_customer",
            current_period_starts_at: 3_000,
            current_period_ends_at: 4_000,
            gives_access: true,
            status: "active",
            entitlements: { items: [{ id: "entl_polyglot" }] },
        })) as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;

        await expect(fetchRevenueCatCustomerSubscriptionSnapshot(
            "customer_alias",
            {
                revenuecat_customer_id: "canonical_customer",
                revenuecat_subscription_id: "sub_saved",
                active_entitlement_snapshot: {
                    has_active_subscription: true,
                    access_expires_at_ms: 4_000,
                },
            }
        )).resolves.toMatchObject({
            has_active_subscription: true,
            revenuecat_customer_id: "canonical_customer",
            revenuecat_subscription_id: "sub_saved",
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("discovers subscriptions when no RevenueCat subscription resource id is saved", async () => {
        configureRevenueCatEnv();
        const fetchMock = jest.fn(async () => jsonResponse(200, {
            items: [{
                id: "sub_discovered",
                customer_id: "canonical_customer",
                current_period_starts_at: 3_000,
                current_period_ends_at: 4_000,
                gives_access: true,
                status: "active",
                entitlements: { items: [{ id: "entl_polyglot" }] },
            }],
        })) as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;

        await expect(fetchRevenueCatCustomerSubscriptionSnapshot(
            "user_with_subscription",
            {
                active_entitlement_snapshot: {
                    has_active_subscription: true,
                    access_expires_at_ms: 4_000,
                },
            }
        )).resolves.toMatchObject({
            has_active_subscription: true,
            revenuecat_customer_id: "canonical_customer",
            revenuecat_subscription_id: "sub_discovered",
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0][0])).toContain(
            "/customers/user_with_subscription/subscriptions?limit=100"
        );
    });

    it.each([
        ["is missing", jsonResponse(404, {
            type: "resource_missing",
            message: "Subscription not found",
        }), {
            has_active_subscription: true,
            access_expires_at_ms: 4_000,
        }],
        ["is inactive", jsonResponse(200, {
            id: "sub_saved",
            customer_id: "user_with_subscription",
            gives_access: false,
        }), {
            has_active_subscription: true,
            access_expires_at_ms: 4_000,
        }],
        ["does not grant Polyglot", jsonResponse(200, {
            id: "sub_saved",
            customer_id: "user_with_subscription",
            current_period_ends_at: 4_000,
            gives_access: true,
            status: "active",
            entitlements: { items: [{ id: "entl_other" }] },
        }), {
            has_active_subscription: true,
            access_expires_at_ms: 4_000,
        }],
        ["belongs to another customer", jsonResponse(200, {
            id: "sub_saved",
            customer_id: "another_customer",
            current_period_ends_at: 4_000,
            gives_access: true,
            status: "active",
            entitlements: { items: [{ id: "entl_polyglot" }] },
        }), {
            has_active_subscription: true,
            access_expires_at_ms: 4_000,
        }],
        ["is inconsistent with the active entitlement", jsonResponse(200, {
            id: "sub_saved",
            customer_id: "user_with_subscription",
            current_period_ends_at: 3_500,
            gives_access: true,
            status: "active",
            entitlements: { items: [{ id: "entl_polyglot" }] },
        }), {
            has_active_subscription: true,
            access_expires_at_ms: 4_000,
        }],
        ["has incomplete billing bounds", jsonResponse(200, {
            id: "sub_saved",
            customer_id: "user_with_subscription",
            current_period_ends_at: 4_000,
            gives_access: true,
            status: "active",
            entitlements: { items: [{ id: "entl_polyglot" }] },
        }), {
            has_active_subscription: true,
            access_expires_at_ms: 4_000,
        }],
    ])("falls back to customer subscriptions when the direct subscription %s", async (
        _case,
        directResponse,
        activeEntitlementSnapshot
    ) => {
        configureRevenueCatEnv();
        const fetchMock = jest.fn(async () => {
            if (fetchMock.mock.calls.length === 1) {
                return directResponse;
            }

            return jsonResponse(200, {
                items: [{
                    id: "sub_discovered",
                    current_period_starts_at: 3_000,
                    current_period_ends_at: 4_000,
                    gives_access: true,
                    status: "active",
                    entitlements: { items: [{ id: "entl_polyglot" }] },
                }],
            });
        }) as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;

        await expect(fetchRevenueCatCustomerSubscriptionSnapshot(
            "user_with_subscription",
            {
                revenuecat_subscription_id: "sub_saved",
                active_entitlement_snapshot: activeEntitlementSnapshot,
            }
        )).resolves.toMatchObject({
            has_active_subscription: true,
            revenuecat_subscription_id: "sub_discovered",
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(String(fetchMock.mock.calls[0][0])).toContain("/subscriptions/sub_saved");
        expect(String(fetchMock.mock.calls[1][0])).toContain(
            "/customers/user_with_subscription/subscriptions?limit=100"
        );
    });

    it("keeps the full discovery request budget after a stale direct lookup", async () => {
        configureRevenueCatEnv();
        let discoveryRequestCount = 0;
        const fetchMock = jest.fn(async (url: string | URL | Request) => {
            if (String(url).includes("/subscriptions/sub_saved")) {
                return jsonResponse(200, {
                    id: "sub_saved",
                    customer_id: "user_with_subscription",
                    gives_access: false,
                });
            }

            discoveryRequestCount += 1;
            if (discoveryRequestCount < 10) {
                return jsonResponse(200, {
                    items: [],
                    next_page:
                        `/v2/projects/proj_test/customers/user_with_subscription/subscriptions?starting_after=page_${discoveryRequestCount}`,
                });
            }

            return jsonResponse(200, {
                items: [{
                    id: "sub_discovered",
                    customer_id: "user_with_subscription",
                    current_period_starts_at: 3_000,
                    current_period_ends_at: 4_000,
                    gives_access: true,
                    status: "active",
                    entitlements: { items: [{ id: "entl_polyglot" }] },
                }],
            });
        }) as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;

        await expect(fetchRevenueCatCustomerSubscriptionSnapshot(
            "user_with_subscription",
            {
                revenuecat_subscription_id: "sub_saved",
                active_entitlement_snapshot: {
                    has_active_subscription: true,
                    access_expires_at_ms: 4_000,
                },
            }
        )).resolves.toMatchObject({
            has_active_subscription: true,
            revenuecat_subscription_id: "sub_discovered",
        });
        expect(fetchMock).toHaveBeenCalledTimes(11);
    });

    it("treats a missing customer as an inactive subscription snapshot", async () => {
        configureRevenueCatEnv();
        globalThis.fetch = jest.fn(async () => jsonResponse(404, {
            type: "resource_missing",
            message: "Customer not found",
        })) as typeof fetch;

        await expect(fetchRevenueCatCustomerSubscriptionSnapshot("user_without_customer"))
            .resolves.toEqual({
                has_active_subscription: false,
            });
    });

    it("does not match subscriptions by entitlement lookup key", async () => {
        configureRevenueCatEnv();
        globalThis.fetch = jest.fn(async () => jsonResponse(200, {
            items: [{
                id: "sub_other",
                gives_access: true,
                entitlements: {
                    items: [{ id: "entl_other", lookup_key: "polyglot" }],
                },
            }],
        })) as typeof fetch;

        await expect(fetchRevenueCatCustomerSubscriptionSnapshot("user_with_other_entitlement"))
            .resolves.toEqual({
                has_active_subscription: false,
            });
    });

    it("uses access-granting subscription metadata instead of newer inactive history", async () => {
        configureRevenueCatEnv();
        const fetchMock = jest.fn(async () => jsonResponse(200, {
                items: [
                    {
                        id: "sub_inactive",
                        product_id: "prod_inactive",
                        current_period_starts_at: 1_850_000_000_000,
                        current_period_ends_at: 1_950_000_000_000,
                        gives_access: false,
                        entitlements: {
                            items: [{ id: "entl_polyglot" }],
                        },
                    },
                    {
                        id: "sub_active",
                        product_id: "prod_active",
                        current_period_starts_at: 1_800_000_000_000,
                        current_period_ends_at: 1_900_000_000_000,
                        gives_access: true,
                        entitlements: {
                            items: [{ id: "entl_polyglot" }],
                        },
                    },
                ],
            })) as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;

        await expect(fetchRevenueCatCustomerSubscriptionSnapshot("user_with_polyglot"))
            .resolves.toMatchObject({
                has_active_subscription: true,
                product_id: "prod_active",
            });
    });

    it("follows paginated subscription entitlements to find polyglot", async () => {
        configureRevenueCatEnv();
        const entitlementNextPage =
            "/v2/projects/proj_test/subscriptions/sub_test/entitlements?starting_after=entl_other";
        const fetchMock = jest.fn(async (url: string | URL | Request) => {
            if (String(url).endsWith("/subscriptions?limit=100")) {
                return jsonResponse(200, {
                    items: [
                        {
                            id: "sub_test",
                            gives_access: true,
                            entitlements: {
                                items: [{ id: "entl_other" }],
                                next_page: entitlementNextPage,
                            },
                        },
                    ],
                });
            }

            return jsonResponse(200, {
                items: [{ id: "entl_polyglot" }],
            });
        }) as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;

        await expect(fetchRevenueCatCustomerSubscriptionSnapshot("user_with_many_entitlements"))
            .resolves.toMatchObject({
                has_active_subscription: true,
                entitlement_id: "entl_polyglot",
            });
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            `https://api.revenuecat.com${entitlementNextPage}`,
            expect.objectContaining({ method: "GET" })
        );
    });

    it("follows documented v2 pagination paths for active entitlements", async () => {
        configureRevenueCatEnv();
        const activeEntitlementsNextPage =
            "/v2/projects/proj_test/customers/user_with_history/active_entitlements?starting_after=entl_other";
        const fetchMock = jest.fn(async (url: string | URL | Request) => {
            if (String(url).endsWith("/active_entitlements?limit=100")) {
                return jsonResponse(200, {
                    items: [{ entitlement_id: "entl_other", expires_at: null }],
                    next_page: activeEntitlementsNextPage,
                });
            }

            if (String(url).endsWith(activeEntitlementsNextPage)) {
                return jsonResponse(200, {
                    items: [{ entitlement_id: "entl_polyglot", expires_at: null }],
                });
            }

            throw new Error(`Unexpected RevenueCat request: ${String(url)}`);
        }) as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;

        await expect(fetchRevenueCatCustomerActiveEntitlementSnapshot("user_with_history"))
            .resolves.toMatchObject({
                has_active_subscription: true,
                entitlement_id: "entl_polyglot",
            });
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            `https://api.revenuecat.com${activeEntitlementsNextPage}`,
            expect.objectContaining({ method: "GET" })
        );
    });

    it("rejects malformed successful active entitlement responses", async () => {
        configureRevenueCatEnv();
        globalThis.fetch = jest.fn(async () => jsonResponse(200, {})) as typeof fetch;

        await expect(fetchRevenueCatCustomerActiveEntitlementSnapshot("user_with_invalid_response"))
            .rejects.toThrow("RevenueCat v2 active entitlements request returned an invalid list response");
    });

    it("rejects malformed active entitlement entries", async () => {
        configureRevenueCatEnv();
        globalThis.fetch = jest.fn(async () => jsonResponse(200, {
            items: [{}],
        })) as typeof fetch;

        await expect(fetchRevenueCatCustomerActiveEntitlementSnapshot("user_with_invalid_entitlement"))
            .rejects.toThrow("RevenueCat v2 active entitlements request returned an invalid entitlement");
    });

    it("rejects non-object active entitlement entries", async () => {
        configureRevenueCatEnv();
        globalThis.fetch = jest.fn(async () => jsonResponse(200, {
            items: [null],
        })) as typeof fetch;

        await expect(fetchRevenueCatCustomerActiveEntitlementSnapshot("user_with_invalid_list_entry"))
            .rejects.toThrow("RevenueCat v2 active entitlements request returned an invalid list entry");
    });

    it("rejects malformed active entitlement pagination", async () => {
        configureRevenueCatEnv();
        globalThis.fetch = jest.fn(async () => jsonResponse(200, {
            items: [],
            next_page: 42,
        })) as typeof fetch;

        await expect(fetchRevenueCatCustomerActiveEntitlementSnapshot("user_with_invalid_cursor"))
            .rejects.toThrow("RevenueCat v2 active entitlements request returned an invalid next page");
    });

    it("rejects malformed subscription entitlement pagination", async () => {
        configureRevenueCatEnv();
        globalThis.fetch = jest.fn(async () => jsonResponse(200, {
            items: [{
                id: "sub_test",
                gives_access: true,
                entitlements: {
                    items: [{ id: "entl_other" }],
                    next_page: 42,
                },
            }],
        })) as typeof fetch;

        await expect(fetchRevenueCatCustomerSubscriptionSnapshot("user_with_invalid_cursor"))
            .rejects.toThrow("RevenueCat v2 subscription entitlements request returned an invalid next page");
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

        await expect(deleteRevenueCatCustomer("user/with space"))
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
        globalThis.fetch = jest.fn(async () => jsonResponse(404, {
            type: "resource_missing",
        })) as typeof fetch;

        await expect(deleteRevenueCatCustomer("missing_user"))
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

        await expect(deleteRevenueCatCustomer("configured_with_read_key_only"))
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
            await deleteRevenueCatCustomer("rate_limited_user");
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
            await fetchRevenueCatCustomerActiveEntitlementSnapshot("rate_limited_user");
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
            await deleteRevenueCatCustomer("forbidden_user");
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
