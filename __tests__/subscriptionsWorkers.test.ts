import { afterEach, describe, expect, it, jest } from "@jest/globals";

import {
    finalizeDeletedUserData,
    prepareUserAccountDeletion,
    queueDeletedUserDataCleanup,
} from "../subscriptionsWorkers";
import {
    beginSubscriptionStateReconciliationAndScheduleActivation,
    beginSubscriptionStateReconciliationAndScheduleUsageRefresh,
    executePendingSubscriptionActivationRetry,
    executeSubscriptionUsageRefresh,
    expirePendingSubscriptionActivation,
    processRevenueCatWebhookEventById,
    reconcileExpiredSubscriptionStates,
    reconcileObservedSubscriptionStateHandler,
    reconcileSubscriptionStateForUsage,
    tickPendingSubscriptionActivation,
} from "../model/subscriptions/workers";
import {
    PENDING_ACTIVE_SIGNAL_TTL_MS,
    SUBSCRIPTION_RENEWAL_PROPAGATION_GRACE_MS,
} from "../constants/subscriptions";
import { type CurrentSubscriptionState } from "../model/subscriptions/revenueCatApi";

const originalEnv = process.env;
const originalFetch = globalThis.fetch;

function jsonResponse(status: number, payload: unknown) {
    return ({
        ok: status >= 200 && status < 300,
        status,
        headers: {
            get: () => null,
        },
        json: async () => payload,
    } as unknown) as Response;
}

function createSubscriptionState(overrides: Partial<CurrentSubscriptionState> = {}): CurrentSubscriptionState {
    return {
        user_id: "user_1",
        revenuecat_app_user_id: "rc_user_1",
        plan_key: "free",
        has_active_subscription: false,
        last_synced_at_ms: 1_000,
        ...overrides,
    };
}

function createWebhookProcessingCtx(args: {
    event_at_ms: number;
    event_type?: string;
    cancel_reason?: string;
    transferred_from?: string[];
    transferred_to?: string[];
    existing_state: CurrentSubscriptionState | null;
    deletion_blocks?: boolean;
}) {
    const progressMutations: Record<string, unknown>[] = [];
    const leaseAcquisitionMutations: Record<string, unknown>[] = [];
    const reconciliationBegins: Record<string, unknown>[] = [];
    const reconciliationReleases: Record<string, unknown>[] = [];
    const subscriptionStateMutations: Record<string, unknown>[] = [];
    const scheduler = {
        runAfter: jest.fn(async () => null),
        runAt: jest.fn(async () => null),
    };
    let subscriptionStateQueryCount = 0;
    let deletionStateQueryCount = 0;

    const ctx = {
        scheduler,
        runQuery: jest.fn(async (_functionRef: unknown, queryArgs: Record<string, unknown>) => {
            if (typeof queryArgs.event_doc_id === "string") {
                return {
                    event_id: "evt_1",
                    event_type: args.event_type ?? "RENEWAL",
                    event_at_ms: args.event_at_ms,
                    cancel_reason: args.cancel_reason,
                    transferred_from: args.transferred_from ?? [],
                    transferred_to: args.transferred_to ?? [],
                    status: "pending",
                    transaction_id: "txn_1",
                    target_user_ids: ["user_1"],
                    pending_user_ids: ["user_1"],
                    processed_user_ids: [],
                    ignored_user_ids: [],
                };
            }

            if (queryArgs.model === "user") {
                return {
                    createdAt: 900,
                };
            }

            if (typeof queryArgs.user_id === "string") {
                if (subscriptionStateQueryCount === 0) {
                    subscriptionStateQueryCount += 1;
                    return args.existing_state;
                }

                deletionStateQueryCount += 1;
                return {
                    in_progress: args.deletion_blocks === true,
                    blocks_revenuecat_reconciliation: args.deletion_blocks === true,
                };
            }

            throw new Error("Unexpected query in webhook worker test");
        }),
        runMutation: jest.fn(async (_functionRef: unknown, mutationArgs: Record<string, unknown>) => {
            if (
                typeof mutationArgs.event_doc_id === "string" &&
                Array.isArray(mutationArgs.user_ids)
            ) {
                leaseAcquisitionMutations.push(mutationArgs);

                return {
                    status: "pending",
                    acquired_user_ids: ["user_1"],
                    active_processing_user_ids: [],
                    blocked_user_ids: [],
                };
            }

            if (
                typeof mutationArgs.sync_attempt_id === "string" &&
                typeof mutationArgs.lease_duration_ms === "number"
            ) {
                reconciliationBegins.push(mutationArgs);
                return {
                    status: "acquired",
                    revenuecat_app_user_id: "rc_user_1",
                    plan_key: args.existing_state?.plan_key ?? "free",
                    has_active_subscription: args.existing_state?.has_active_subscription ?? false,
                    last_synced_at_ms: args.existing_state?.last_synced_at_ms ?? 0,
                };
            }

            if (
                typeof mutationArgs.retry_index === "number" &&
                typeof mutationArgs.next_retry_at_ms === "number"
            ) {
                return {
                    claimed: true,
                };
            }

            if (
                typeof mutationArgs.sync_attempt_id === "string" &&
                typeof mutationArgs.next_attempt_at_ms === "number"
            ) {
                reconciliationReleases.push(mutationArgs);
                return { released: true };
            }

            if (mutationArgs.snapshot) {
                subscriptionStateMutations.push(mutationArgs);
                const activeSignalAtMs = typeof mutationArgs.active_signal_at_ms === "number"
                    ? mutationArgs.active_signal_at_ms
                    : undefined;
                const syncedAtMs = typeof mutationArgs.synced_at_ms === "number"
                    ? mutationArgs.synced_at_ms
                    : 0;
                const hasLiveActiveSignal =
                    typeof activeSignalAtMs === "number" &&
                    activeSignalAtMs + PENDING_ACTIVE_SIGNAL_TTL_MS > syncedAtMs;

                if (
                    mutationArgs.expects_active_subscription === true &&
                    hasLiveActiveSignal &&
                    (mutationArgs.snapshot as { has_active_subscription?: boolean }).has_active_subscription !== true
                ) {
                    return {
                        status: "pending_active",
                        plan_key: args.existing_state?.plan_key ?? "free",
                        has_active_subscription: args.existing_state?.has_active_subscription ?? false,
                        last_synced_at_ms: args.existing_state?.last_synced_at_ms ?? 0,
                        pending_active_signal_at_ms: activeSignalAtMs,
                    };
                }

                return {
                    status: args.existing_state ? "updated" : "created",
                    plan_key: "free",
                    has_active_subscription: false,
                    last_synced_at_ms: mutationArgs.synced_at_ms,
                };
            }

            if (Array.isArray(mutationArgs.processed_user_ids)) {
                progressMutations.push(mutationArgs);
                const processedUserIds = Array.isArray(mutationArgs.processed_user_ids)
                    ? mutationArgs.processed_user_ids
                    : [];
                const ignoredUserIds = Array.isArray(mutationArgs.ignored_user_ids)
                    ? mutationArgs.ignored_user_ids
                    : [];
                const releasedUserIds = (Array.isArray(mutationArgs.released_user_ids)
                    ? mutationArgs.released_user_ids
                    : []
                ).filter(
                    (userId) =>
                        !processedUserIds.includes(userId) && !ignoredUserIds.includes(userId)
                );

                return {
                    status: releasedUserIds.length > 0 ? "pending" : "processed",
                    pending_user_ids: releasedUserIds,
                    processed_user_ids: processedUserIds,
                    ignored_user_ids: ignoredUserIds,
                };
            }

            throw new Error("Unexpected mutation in webhook worker test");
        }),
    };

    return {
        ctx,
        progressMutations,
        leaseAcquisitionMutations,
        reconciliationBegins,
        reconciliationReleases,
        subscriptionStateMutations,
        scheduler,
        getSubscriptionStateQueryCount: () => subscriptionStateQueryCount,
        getDeletionStateQueryCount: () => deletionStateQueryCount,
    };
}

describe("RevenueCat webhook worker processing", () => {
    afterEach(() => {
        process.env = originalEnv;
        globalThis.fetch = originalFetch;
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it("marks already-applied event users processed without fetching RevenueCat", async () => {
        const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;
        const { ctx, progressMutations, leaseAcquisitionMutations, getDeletionStateQueryCount } = createWebhookProcessingCtx({
            event_at_ms: 1_000,
            existing_state: createSubscriptionState({
                last_revenuecat_event_id: "evt_1",
                last_revenuecat_event_at_ms: 1_000,
            }),
            deletion_blocks: true,
        });

        await expect(
            processRevenueCatWebhookEventById(ctx as any, {
                event_doc_id: "event_doc_1",
                now_ms: 1_500,
            })
        ).resolves.toEqual({
            status: "processed",
        });

        expect(fetchMock).not.toHaveBeenCalled();
        expect(getDeletionStateQueryCount()).toBe(0);
        expect(progressMutations).toHaveLength(1);
        expect(progressMutations[0]).toMatchObject({
            processed_user_ids: ["user_1"],
            ignored_user_ids: [],
            processing_attempt_id: leaseAcquisitionMutations[0].processing_attempt_id,
        });
        expect(typeof leaseAcquisitionMutations[0].processing_attempt_id).toBe("string");
    });

    it.each([
        ["missing state", null],
        ["state without applied event", createSubscriptionState({ last_synced_at_ms: 10_000 })],
        ["state with an older applied event", createSubscriptionState({
            last_revenuecat_event_id: "evt_older",
            last_revenuecat_event_at_ms: 999,
            last_synced_at_ms: 10_000,
        })],
        ["different event with the same timestamp", createSubscriptionState({
            last_revenuecat_event_id: "evt_other",
            last_revenuecat_event_at_ms: 1_000,
            last_synced_at_ms: 10_000,
        })],
    ])("fetches RevenueCat when %s", async (_name, existingState) => {
        process.env = {
            ...originalEnv,
            REVENUECAT_CI_SUBSCRIPTIONS_R_API_KEY: "rc_v2_secret",
            REVENUECAT_PROJECT_ID: "proj_test",
            REVENUECAT_POLYGLOT_ENTITLEMENT_ID: "entl_polyglot",
        };
        const fetchMock = jest.fn(async () => jsonResponse(200, { items: [] })) as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;
        const { ctx, progressMutations, leaseAcquisitionMutations } = createWebhookProcessingCtx({
            event_at_ms: 1_000,
            event_type: "EXPIRATION",
            existing_state: existingState,
        });

        await expect(
            processRevenueCatWebhookEventById(ctx as any, {
                event_doc_id: "event_doc_1",
                now_ms: 1_500,
            })
        ).resolves.toEqual({
            status: "processed",
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0][0])).toContain("/active_entitlements?limit=100");
        expect(progressMutations).toHaveLength(1);
        expect(progressMutations[0]).toMatchObject({
            processed_user_ids: ["user_1"],
            ignored_user_ids: [],
            processing_attempt_id: leaseAcquisitionMutations[0].processing_attempt_id,
        });
        expect(typeof leaseAcquisitionMutations[0].processing_attempt_id).toBe("string");
    });

    it.each([
        { eventType: "EXPIRATION", transferredFrom: [] },
        { eventType: "TRANSFER", transferredFrom: ["user_1"] },
    ])("accepts RevenueCat revocation for a $eventType webhook source", async ({
        eventType,
        transferredFrom,
    }) => {
        jest.spyOn(Date, "now").mockReturnValue(1_500);
        process.env = {
            ...originalEnv,
            REVENUECAT_CI_SUBSCRIPTIONS_R_API_KEY: "rc_v2_secret",
            REVENUECAT_PROJECT_ID: "proj_test",
            REVENUECAT_POLYGLOT_ENTITLEMENT_ID: "entl_polyglot",
        };
        globalThis.fetch = jest.fn(async () => jsonResponse(200, { items: [] })) as typeof fetch;
        const {
            ctx,
            progressMutations,
            subscriptionStateMutations,
        } = createWebhookProcessingCtx({
            event_at_ms: 1_000,
            event_type: eventType,
            transferred_from: transferredFrom,
            existing_state: createSubscriptionState({
                plan_key: "polyglot",
                has_active_subscription: true,
                access_expires_at_ms: 5_000,
            }),
        });

        await expect(
            processRevenueCatWebhookEventById(ctx as any, {
                event_doc_id: "event_doc_1",
                now_ms: 1_500,
            })
        ).resolves.toEqual({ status: "processed" });

        expect(subscriptionStateMutations).toHaveLength(1);
        expect(subscriptionStateMutations[0]).toMatchObject({
            snapshot: { has_active_subscription: false },
        });
        expect(progressMutations[0]).toMatchObject({
            processed_user_ids: ["user_1"],
            ignored_user_ids: [],
        });
    });

    it("keeps a transfer destination pending until active access is confirmed", async () => {
        jest.spyOn(Date, "now").mockReturnValue(1_500);
        process.env = {
            ...originalEnv,
            REVENUECAT_CI_SUBSCRIPTIONS_R_API_KEY: "rc_v2_secret",
            REVENUECAT_PROJECT_ID: "proj_test",
            REVENUECAT_POLYGLOT_ENTITLEMENT_ID: "entl_polyglot",
        };
        globalThis.fetch = jest.fn(async () => jsonResponse(200, { items: [] })) as typeof fetch;
        const { ctx, reconciliationBegins, subscriptionStateMutations } =
            createWebhookProcessingCtx({
                event_at_ms: 1_000,
                event_type: "TRANSFER",
                transferred_to: ["user_1"],
                existing_state: createSubscriptionState(),
            });

        await expect(processRevenueCatWebhookEventById(ctx as any, {
            event_doc_id: "event_doc_1",
            now_ms: 1_500,
        })).resolves.toEqual({ status: "deferred" });

        expect(reconciliationBegins[0]).toMatchObject({
            expects_active_subscription: true,
            trusted_active_signal: true,
        });
        expect(subscriptionStateMutations[0]).toMatchObject({
            expects_active_subscription: true,
            snapshot: { has_active_subscription: false },
        });
    });

    it("accepts a refunded cancellation as an authoritative revocation", async () => {
        jest.spyOn(Date, "now").mockReturnValue(1_500);
        process.env = {
            ...originalEnv,
            REVENUECAT_CI_SUBSCRIPTIONS_R_API_KEY: "rc_v2_secret",
            REVENUECAT_PROJECT_ID: "proj_test",
            REVENUECAT_POLYGLOT_ENTITLEMENT_ID: "entl_polyglot",
        };
        globalThis.fetch = jest.fn(async () => jsonResponse(200, { items: [] })) as typeof fetch;
        const { ctx, subscriptionStateMutations } = createWebhookProcessingCtx({
            event_at_ms: 1_000,
            event_type: "CANCELLATION",
            cancel_reason: "CUSTOMER_SUPPORT",
            existing_state: createSubscriptionState({
                plan_key: "polyglot",
                has_active_subscription: true,
                access_expires_at_ms: 5_000,
            }),
        });

        await expect(processRevenueCatWebhookEventById(ctx as any, {
            event_doc_id: "event_doc_1",
            now_ms: 1_500,
        })).resolves.toEqual({ status: "processed" });

        expect(subscriptionStateMutations[0]).toMatchObject({
            snapshot: { has_active_subscription: false },
        });
    });

    it("preserves confirmed access when an ordinary cancellation read is inactive", async () => {
        jest.spyOn(Date, "now").mockReturnValue(1_500);
        process.env = {
            ...originalEnv,
            REVENUECAT_CI_SUBSCRIPTIONS_R_API_KEY: "rc_v2_secret",
            REVENUECAT_PROJECT_ID: "proj_test",
            REVENUECAT_POLYGLOT_ENTITLEMENT_ID: "entl_polyglot",
        };
        globalThis.fetch = jest.fn(async () => jsonResponse(200, { items: [] })) as typeof fetch;
        const {
            ctx,
            progressMutations,
            reconciliationReleases,
            subscriptionStateMutations,
        } = createWebhookProcessingCtx({
            event_at_ms: 1_000,
            event_type: "CANCELLATION",
            existing_state: createSubscriptionState({
                plan_key: "polyglot",
                has_active_subscription: true,
                access_expires_at_ms: 5_000,
            }),
        });

        await expect(processRevenueCatWebhookEventById(ctx as any, {
            event_doc_id: "event_doc_1",
            now_ms: 1_500,
        })).resolves.toEqual({ status: "deferred" });

        expect(subscriptionStateMutations).toHaveLength(0);
        expect(reconciliationReleases[0]).toMatchObject({
            user_id: "user_1",
            next_attempt_at_ms: 5_000 + SUBSCRIPTION_RENEWAL_PROPAGATION_GRACE_MS,
        });
        expect(progressMutations[0]).toMatchObject({
            next_retry_at_ms: 5_000 + SUBSCRIPTION_RENEWAL_PROPAGATION_GRACE_MS,
        });
    });

    it("keeps canceled subscriptions active through their confirmed access period", async () => {
        jest.spyOn(Date, "now").mockReturnValue(1_500);
        process.env = {
            ...originalEnv,
            REVENUECAT_CI_SUBSCRIPTIONS_R_API_KEY: "rc_v2_secret",
            REVENUECAT_PROJECT_ID: "proj_test",
            REVENUECAT_POLYGLOT_ENTITLEMENT_ID: "entl_polyglot",
        };
        globalThis.fetch = jest.fn(async (url: string | URL | Request) => {
            if (String(url).includes("/active_entitlements")) {
                return jsonResponse(200, {
                    items: [{
                        entitlement_id: "entl_polyglot",
                        expires_at: 5_000,
                    }],
                });
            }

            return jsonResponse(200, {
                items: [{
                    id: "sub_polyglot",
                    product_id: "prod_polyglot",
                    current_period_starts_at: 1_000,
                    current_period_ends_at: 5_000,
                    gives_access: true,
                    status: "active",
                    entitlements: { items: [{ id: "entl_polyglot" }] },
                }],
            });
        }) as typeof fetch;
        const { ctx, subscriptionStateMutations } = createWebhookProcessingCtx({
            event_at_ms: 1_000,
            event_type: "CANCELLATION",
            existing_state: createSubscriptionState({
                plan_key: "polyglot",
                has_active_subscription: true,
                access_expires_at_ms: 5_000,
            }),
        });

        await expect(processRevenueCatWebhookEventById(ctx as any, {
            event_doc_id: "event_doc_1",
            now_ms: 1_500,
        })).resolves.toEqual({ status: "processed" });

        expect(subscriptionStateMutations[0]).toMatchObject({
            snapshot: {
                has_active_subscription: true,
                period_end_at_ms: 5_000,
            },
        });
    });

    it("defers active webhooks while RevenueCat still reports inactive", async () => {
        jest.spyOn(Date, "now").mockReturnValue(1_500);
        process.env = {
            ...originalEnv,
            REVENUECAT_CI_SUBSCRIPTIONS_R_API_KEY: "rc_v2_secret",
            REVENUECAT_PROJECT_ID: "proj_test",
            REVENUECAT_POLYGLOT_ENTITLEMENT_ID: "entl_polyglot",
        };
        const fetchMock = jest.fn(async () => jsonResponse(200, { items: [] })) as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;
        const {
            ctx,
            progressMutations,
            leaseAcquisitionMutations,
            reconciliationBegins,
            scheduler,
        } = createWebhookProcessingCtx({
            event_at_ms: 1_000,
            event_type: "RENEWAL",
            existing_state: createSubscriptionState({ last_synced_at_ms: 10_000 }),
        });

        await expect(
            processRevenueCatWebhookEventById(ctx as any, {
                event_doc_id: "event_doc_1",
                now_ms: 1_500,
            })
        ).resolves.toEqual({
            status: "deferred",
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(progressMutations).toHaveLength(1);
        expect(progressMutations[0]).toMatchObject({
            processed_user_ids: [],
            ignored_user_ids: [],
            released_user_ids: ["user_1"],
            processing_attempt_id: leaseAcquisitionMutations[0].processing_attempt_id,
        });
        expect(typeof progressMutations[0].status_message).toBe("string");
        expect(reconciliationBegins).toHaveLength(1);
        expect(reconciliationBegins[0]).toMatchObject({
            expects_active_subscription: true,
            active_signal_at_ms: 1_000,
            event_doc_id: "event_doc_1",
        });
        expect(scheduler.runAfter).not.toHaveBeenCalled();
    });

    it("processes stale active webhooks instead of deferring forever", async () => {
        process.env = {
            ...originalEnv,
            REVENUECAT_CI_SUBSCRIPTIONS_R_API_KEY: "rc_v2_secret",
            REVENUECAT_PROJECT_ID: "proj_test",
            REVENUECAT_POLYGLOT_ENTITLEMENT_ID: "entl_polyglot",
        };
        const fetchMock = jest.fn(async () => jsonResponse(200, { items: [] })) as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;
        const { ctx, progressMutations } = createWebhookProcessingCtx({
            event_at_ms: 1_000,
            event_type: "RENEWAL",
            existing_state: createSubscriptionState({ last_synced_at_ms: 10_000 }),
        });

        await expect(
            processRevenueCatWebhookEventById(ctx as any, {
                event_doc_id: "event_doc_1",
                now_ms: 1_000 + PENDING_ACTIVE_SIGNAL_TTL_MS + 1,
            })
        ).resolves.toEqual({
            status: "processed",
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(progressMutations).toHaveLength(1);
        expect(progressMutations[0]).toMatchObject({
            processed_user_ids: ["user_1"],
            ignored_user_ids: [],
        });
    });

    it.each([
        "NON_RENEWING_PURCHASE",
        "TEMPORARY_ENTITLEMENT_GRANT",
    ])("keeps %s neutral to subscription activation state", async (eventType) => {
        process.env = {
            ...originalEnv,
            REVENUECAT_CI_SUBSCRIPTIONS_R_API_KEY: "rc_v2_secret",
            REVENUECAT_PROJECT_ID: "proj_test",
            REVENUECAT_POLYGLOT_ENTITLEMENT_ID: "entl_polyglot",
        };
        globalThis.fetch = jest.fn(async () => jsonResponse(200, { items: [] })) as typeof fetch;
        const { ctx, subscriptionStateMutations } = createWebhookProcessingCtx({
            event_at_ms: 1_000,
            event_type: eventType,
            existing_state: createSubscriptionState(),
        });

        await processRevenueCatWebhookEventById(ctx as any, {
            event_doc_id: "event_doc_1",
            now_ms: 1_500,
        });

        expect(subscriptionStateMutations).toHaveLength(1);
        expect(subscriptionStateMutations[0]).not.toHaveProperty("clear_pending_active_signal");
        expect(subscriptionStateMutations[0]).not.toHaveProperty("store_subscription_id_hint");
        expect(subscriptionStateMutations[0]).not.toHaveProperty("expects_active_subscription");
    });
});

describe("RevenueCat reconciliation routing", () => {
    afterEach(() => {
        process.env = originalEnv;
        globalThis.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    function configureReadEnv() {
        process.env = {
            ...originalEnv,
            REVENUECAT_CI_SUBSCRIPTIONS_R_API_KEY: "rc_v2_secret",
            REVENUECAT_PROJECT_ID: "proj_test",
            REVENUECAT_POLYGLOT_ENTITLEMENT_ID: "entl_polyglot",
        };
    }

    it("uses only active entitlements for an inactive usage refresh", async () => {
        configureReadEnv();
        process.env.REVENUECAT_ON_DEMAND_SYNC_AFTER_MS = "1000";
        jest.spyOn(Date, "now").mockReturnValue(3_000);
        const fetchMock = jest.fn(async () => jsonResponse(200, { items: [] })) as jest.MockedFunction<
            typeof fetch
        >;
        globalThis.fetch = fetchMock;
        const { ctx } = createWebhookProcessingCtx({
            event_at_ms: 1_000,
            existing_state: createSubscriptionState(),
        });

        await expect(
            reconcileSubscriptionStateForUsage(ctx as any, { user_id: "user_1" })
        ).resolves.toMatchObject({
            status: "updated",
            has_active_subscription: false,
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0][0])).toContain("/active_entitlements?limit=100");
    });

    it("uses active entitlements first for client-observed purchase and restore state", async () => {
        configureReadEnv();
        jest.spyOn(Date, "now").mockReturnValue(3_000);
        const fetchMock = jest.fn(async () => jsonResponse(200, { items: [] })) as jest.MockedFunction<
            typeof fetch
        >;
        globalThis.fetch = fetchMock;
        const { ctx } = createWebhookProcessingCtx({
            event_at_ms: 1_000,
            existing_state: createSubscriptionState(),
        });

        await reconcileObservedSubscriptionStateHandler(ctx as any, {
            user_id: "user_1",
            observed_active: true,
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0][0])).toContain("/active_entitlements?limit=100");
    });

    it("falls through to subscriptions when a usage refresh finds active access", async () => {
        configureReadEnv();
        process.env.REVENUECAT_ON_DEMAND_SYNC_AFTER_MS = "1000";
        jest.spyOn(Date, "now").mockReturnValue(3_000);
        const fetchMock = jest.fn(async (url: string | URL | Request) => {
            if (String(url).includes("/active_entitlements")) {
                return jsonResponse(200, {
                    items: [{
                        entitlement_id: "entl_polyglot",
                        expires_at: 4_000,
                    }],
                });
            }

            return jsonResponse(200, { items: [] });
        }) as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;
        const { ctx } = createWebhookProcessingCtx({
            event_at_ms: 1_000,
            existing_state: createSubscriptionState(),
        });

        await expect(
            reconcileSubscriptionStateForUsage(ctx as any, { user_id: "user_1" })
        ).resolves.toMatchObject({
            status: "refresh_failed",
            should_block_requests: true,
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(String(fetchMock.mock.calls[0][0])).toContain("/active_entitlements?limit=100");
        expect(String(fetchMock.mock.calls[1][0])).toContain("/subscriptions?limit=100");
    });

    it("serves a soft-stale grace-period state and schedules its refresh", async () => {
        configureReadEnv();
        process.env.REVENUECAT_ON_DEMAND_SYNC_AFTER_MS = "1000";
        jest.spyOn(Date, "now").mockReturnValue(3_000);
        const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;
        const { ctx, reconciliationBegins } = createWebhookProcessingCtx({
            event_at_ms: 1_000,
            existing_state: createSubscriptionState({
                plan_key: "polyglot",
                has_active_subscription: true,
                last_synced_at_ms: 2_000,
                billing_cycle_end_at_ms: 2_000,
                access_expires_at_ms: 5_000,
            }),
        });

        await expect(
            reconcileSubscriptionStateForUsage(ctx as any, { user_id: "user_1" })
        ).resolves.toMatchObject({
            status: "already_fresh",
            plan_key: "polyglot",
            has_active_subscription: true,
            billing_cycle_end_at_ms: 2_000,
        });

        expect(fetchMock).not.toHaveBeenCalled();
        expect(reconciliationBegins).toHaveLength(1);
        expect(reconciliationBegins[0]).toMatchObject({
            user_id: "user_1",
            revenuecat_app_user_id: "rc_user_1",
            now_ms: 3_000,
            lease_duration_ms: 90_000,
        });
    });

    it("does not demote unexpired access when a scheduled refresh is temporarily inactive", async () => {
        configureReadEnv();
        jest.spyOn(Date, "now").mockReturnValue(3_000);
        globalThis.fetch = jest.fn(async () => jsonResponse(200, { items: [] })) as typeof fetch;
        const {
            ctx,
            reconciliationReleases,
            subscriptionStateMutations,
        } = createWebhookProcessingCtx({
            event_at_ms: 1_000,
            existing_state: createSubscriptionState({
                plan_key: "polyglot",
                has_active_subscription: true,
                last_synced_at_ms: 2_000,
                access_expires_at_ms: 5_000,
            }),
        });

        await expect(
            executeSubscriptionUsageRefresh(ctx as any, {
                user_id: "user_1",
                sync_attempt_id: "sync_1",
            })
        ).resolves.toEqual({ status: "refresh_failed" });

        expect(subscriptionStateMutations).toHaveLength(0);
        expect(reconciliationReleases).toHaveLength(1);
        expect(reconciliationReleases[0]).toMatchObject({
            user_id: "user_1",
            sync_attempt_id: "sync_1",
            now_ms: 3_000,
        });
    });

    it("corroborates an empty entitlement read with subscriptions for existing access", async () => {
        configureReadEnv();
        jest.spyOn(Date, "now").mockReturnValue(3_000);
        const fetchMock = jest.fn(async (url: string | URL | Request) => {
            if (String(url).includes("/active_entitlements")) {
                return jsonResponse(200, { items: [] });
            }

            return jsonResponse(200, {
                items: [{
                    id: "sub_polyglot",
                    product_id: "prod_polyglot",
                    current_period_starts_at: 2_000,
                    current_period_ends_at: 6_000,
                    gives_access: true,
                    status: "active",
                    entitlements: {
                        items: [{ id: "entl_polyglot" }],
                    },
                }],
            });
        }) as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;
        const { ctx, subscriptionStateMutations } = createWebhookProcessingCtx({
            event_at_ms: 1_000,
            existing_state: createSubscriptionState({
                plan_key: "polyglot",
                has_active_subscription: true,
                last_synced_at_ms: 2_000,
                access_expires_at_ms: 5_000,
            }),
        });

        await executeSubscriptionUsageRefresh(ctx as any, {
            user_id: "user_1",
            sync_attempt_id: "sync_1",
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(subscriptionStateMutations).toHaveLength(1);
        expect(subscriptionStateMutations[0].snapshot).toMatchObject({
            has_active_subscription: true,
            period_end_at_ms: 6_000,
        });
    });

    it("keeps billing and access expiration separate during grace reconciliation", async () => {
        configureReadEnv();
        jest.spyOn(Date, "now").mockReturnValue(3_000);
        const fetchMock = jest.fn(async (url: string | URL | Request) => {
            if (String(url).includes("/active_entitlements")) {
                return jsonResponse(200, {
                    items: [{
                        entitlement_id: "entl_polyglot",
                        expires_at: 5_000,
                    }],
                });
            }

            return jsonResponse(200, {
                items: [{
                    id: "sub_polyglot",
                    product_id: "prod_polyglot",
                    current_period_starts_at: 1_000,
                    current_period_ends_at: 2_000,
                    gives_access: true,
                    status: "in_grace_period",
                    entitlements: {
                        items: [{ id: "entl_polyglot" }],
                    },
                }],
            });
        }) as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;
        const { ctx, subscriptionStateMutations } = createWebhookProcessingCtx({
            event_at_ms: 1_000,
            existing_state: createSubscriptionState({
                plan_key: "polyglot",
                has_active_subscription: true,
                billing_cycle_end_at_ms: 2_000,
            }),
        });

        await executeSubscriptionUsageRefresh(ctx as any, {
            user_id: "user_1",
            sync_attempt_id: "sync_1",
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(subscriptionStateMutations).toHaveLength(1);
        expect(subscriptionStateMutations[0].snapshot).toMatchObject({
            has_active_subscription: true,
            period_start_at_ms: 1_000,
            period_end_at_ms: 2_000,
            access_expires_at_ms: 5_000,
        });
    });

    it("keeps active usage available at the exact billing period end", async () => {
        configureReadEnv();
        process.env.REVENUECAT_ON_DEMAND_SYNC_AFTER_MS = "1000";
        jest.spyOn(Date, "now").mockReturnValue(3_000);
        const fetchMock = jest.fn(async () => jsonResponse(200, { items: [] })) as jest.MockedFunction<
            typeof fetch
        >;
        globalThis.fetch = fetchMock;
        const { ctx } = createWebhookProcessingCtx({
            event_at_ms: 1_000,
            existing_state: createSubscriptionState({
                plan_key: "polyglot",
                has_active_subscription: true,
                last_synced_at_ms: 1_000,
                billing_cycle_end_at_ms: 3_000,
            }),
        });

        await expect(
            reconcileSubscriptionStateForUsage(ctx as any, { user_id: "user_1" })
        ).resolves.toMatchObject({
            status: "already_fresh",
            has_active_subscription: true,
        });

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("keeps renewal continuity while activation is pending", async () => {
        configureReadEnv();
        process.env.REVENUECAT_ON_DEMAND_SYNC_AFTER_MS = "1000";
        jest.spyOn(Date, "now").mockReturnValue(3_000);
        const fetchMock = jest.fn(async () => jsonResponse(200, { items: [] })) as jest.MockedFunction<
            typeof fetch
        >;
        globalThis.fetch = fetchMock;
        const { ctx } = createWebhookProcessingCtx({
            event_at_ms: 1_000,
            existing_state: createSubscriptionState({
                plan_key: "polyglot",
                has_active_subscription: true,
                last_synced_at_ms: 1_000,
                billing_cycle_end_at_ms: 3_000,
                pending_active_signal_at_ms: 2_500,
                pending_active_expires_at_ms: 4_000,
            }),
        });

        await reconcileSubscriptionStateForUsage(ctx as any, { user_id: "user_1" });

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("serves trusted active state without rescheduling during refresh backoff", async () => {
        configureReadEnv();
        process.env.REVENUECAT_ON_DEMAND_SYNC_AFTER_MS = "1000";
        jest.spyOn(Date, "now").mockReturnValue(3_000);
        const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;
        const { ctx, reconciliationBegins } = createWebhookProcessingCtx({
            event_at_ms: 1_000,
            existing_state: createSubscriptionState({
                plan_key: "polyglot",
                has_active_subscription: true,
                last_synced_at_ms: 1_000,
                billing_cycle_end_at_ms: 5_000,
                next_refresh_attempt_at_ms: 4_000,
            }),
        });

        await expect(
            reconcileSubscriptionStateForUsage(ctx as any, { user_id: "user_1" })
        ).resolves.toMatchObject({
            status: "already_fresh",
            has_active_subscription: true,
        });

        expect(fetchMock).not.toHaveBeenCalled();
        expect(reconciliationBegins).toHaveLength(0);
    });

    it("lets an expired subscriber use the free plan during refresh backoff", async () => {
        configureReadEnv();
        process.env.REVENUECAT_ON_DEMAND_SYNC_AFTER_MS = "1000";
        jest.spyOn(Date, "now").mockReturnValue(3_000);
        const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;
        const { ctx, reconciliationBegins } = createWebhookProcessingCtx({
            event_at_ms: 1_000,
            existing_state: createSubscriptionState({
                plan_key: "polyglot",
                has_active_subscription: true,
                last_synced_at_ms: 1_000,
                billing_cycle_end_at_ms:
                    3_000 - SUBSCRIPTION_RENEWAL_PROPAGATION_GRACE_MS,
                next_refresh_attempt_at_ms: 4_000,
            }),
        });

        await expect(
            reconcileSubscriptionStateForUsage(ctx as any, { user_id: "user_1" })
        ).resolves.toMatchObject({
            status: "refresh_failed",
            should_block_requests: false,
        });

        expect(fetchMock).not.toHaveBeenCalled();
        expect(reconciliationBegins).toHaveLength(0);
    });

    it("polls a required inline sync for at most 1.75 seconds", async () => {
        configureReadEnv();
        process.env.REVENUECAT_ON_DEMAND_SYNC_AFTER_MS = "1000";
        jest.useFakeTimers();
        jest.spyOn(Date, "now").mockReturnValue(3_000);
        const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;
        let stateQueryCount = 0;
        const runMutation = jest.fn(async () => ({
            status: "in_progress",
            revenuecat_app_user_id: "rc_user_1",
            plan_key: "free",
            has_active_subscription: false,
            last_synced_at_ms: 1_000,
            retry_at_ms: 93_000,
        }));
        const ctx = {
            runQuery: jest.fn(async (_functionRef: unknown, queryArgs: Record<string, unknown>) => {
                if (queryArgs.model === "user") {
                    return { createdAt: 900 };
                }

                if (queryArgs.user_id === "user_1") {
                    stateQueryCount += 1;
                    return stateQueryCount % 2 === 1
                        ? createSubscriptionState()
                        : { blocks_revenuecat_reconciliation: false };
                }

                throw new Error("Unexpected query in usage polling test");
            }),
            runMutation,
        };

        const resultPromise = reconcileSubscriptionStateForUsage(ctx as any, {
            user_id: "user_1",
        });
        await jest.advanceTimersByTimeAsync(1_750);

        await expect(resultPromise).resolves.toMatchObject({
            status: "sync_in_progress",
            retry_at_ms: 93_000,
        });
        expect(runMutation).toHaveBeenCalledTimes(4);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("reuses the pre-acquired attempt for a scheduled usage refresh", async () => {
        configureReadEnv();
        jest.spyOn(Date, "now").mockReturnValue(3_000);
        globalThis.fetch = jest.fn(async () => jsonResponse(200, { items: [] })) as typeof fetch;
        const { ctx, reconciliationBegins } = createWebhookProcessingCtx({
            event_at_ms: 1_000,
            existing_state: createSubscriptionState(),
        });

        await expect(executeSubscriptionUsageRefresh(ctx as any, {
            user_id: "user_1",
            sync_attempt_id: "usage_attempt_1",
        })).resolves.toEqual({ status: "updated" });

        expect(reconciliationBegins).toHaveLength(1);
        expect(reconciliationBegins[0]).toMatchObject({
            sync_attempt_id: "usage_attempt_1",
        });
    });

    it("polls only active entitlements while activation is still pending", async () => {
        configureReadEnv();
        jest.spyOn(Date, "now").mockReturnValue(1_500);
        const fetchMock = jest.fn(async () => jsonResponse(200, { items: [] })) as jest.MockedFunction<
            typeof fetch
        >;
        globalThis.fetch = fetchMock;
        const { ctx } = createWebhookProcessingCtx({
            event_at_ms: 1_000,
            existing_state: createSubscriptionState(),
        });

        await expect(executePendingSubscriptionActivationRetry(ctx as any, {
            user_id: "user_1",
            active_signal_at_ms: 1_000,
            retry_index: 0,
        })).resolves.toEqual({
            status: "pending_active",
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0][0])).toContain("/active_entitlements?limit=100");
    });

    it("waits through renewal propagation before accepting an inactive snapshot", async () => {
        configureReadEnv();
        jest.spyOn(Date, "now").mockReturnValue(3_000);
        const fetchMock = jest.fn(async () => jsonResponse(200, { items: [] })) as jest.MockedFunction<
            typeof fetch
        >;
        globalThis.fetch = fetchMock;
        let subscriptionStateQueryCount = 0;
        const ctx = {
            runQuery: jest.fn(async (_functionRef: unknown, queryArgs: Record<string, unknown>) => {
                if (typeof queryArgs.limit === "number") {
                    return [{
                        user_id: "user_1",
                        last_synced_at_ms: 1_000,
                        expiration_reconciliation_at_ms: 2_000,
                        billing_cycle_end_at_ms: 2_000,
                    }];
                }
                if (queryArgs.model === "user") {
                    return { createdAt: 900 };
                }
                if (queryArgs.user_id === "user_1") {
                    subscriptionStateQueryCount += 1;
                    return subscriptionStateQueryCount === 1
                        ? createSubscriptionState({
                              plan_key: "polyglot",
                              has_active_subscription: true,
                              billing_cycle_end_at_ms: 2_000,
                          })
                        : { blocks_revenuecat_reconciliation: false };
                }
                throw new Error("Unexpected query in expiration reconciliation test");
            }),
            runMutation: jest.fn(async (_functionRef: unknown, mutationArgs: Record<string, unknown>) => {
                if (typeof mutationArgs.lease_duration_ms === "number") {
                    return {
                        status: "acquired",
                        revenuecat_app_user_id: "rc_user_1",
                        plan_key: "polyglot",
                        has_active_subscription: true,
                        last_synced_at_ms: 1_000,
                        billing_cycle_end_at_ms: 2_000,
                    };
                }
                if (typeof mutationArgs.next_attempt_at_ms === "number") {
                    return { status: "deferred" };
                }
                throw new Error("Unexpected mutation in expiration reconciliation test");
            }),
        };

        await expect(reconcileExpiredSubscriptionStates(ctx as any)).resolves.toEqual({
            processed: 0,
            failed: 1,
            scanned: 1,
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(String(fetchMock.mock.calls[0][0])).toContain("/active_entitlements?limit=100");
        expect(String(fetchMock.mock.calls[1][0])).toContain("/subscriptions?limit=100");
        expect(ctx.runMutation).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                user_id: "user_1",
                next_attempt_at_ms: 2_000 + SUBSCRIPTION_RENEWAL_PROPAGATION_GRACE_MS,
            })
        );
    });

    it("accepts an inactive snapshot after renewal propagation expires", async () => {
        configureReadEnv();
        jest.spyOn(Date, "now").mockReturnValue(3_000);
        globalThis.fetch = jest.fn(async () => jsonResponse(200, { items: [] })) as typeof fetch;
        const confirmedExpirationAtMs =
            3_000 - SUBSCRIPTION_RENEWAL_PROPAGATION_GRACE_MS;
        let subscriptionStateQueryCount = 0;
        const ctx = {
            runQuery: jest.fn(async (_functionRef: unknown, queryArgs: Record<string, unknown>) => {
                if (typeof queryArgs.limit === "number") {
                    return [{
                        user_id: "user_1",
                        last_synced_at_ms: 1_000,
                        expiration_reconciliation_at_ms: 2_000,
                        access_expires_at_ms: confirmedExpirationAtMs,
                    }];
                }
                if (queryArgs.model === "user") return { createdAt: 900 };
                if (queryArgs.user_id === "user_1") {
                    subscriptionStateQueryCount += 1;
                    return subscriptionStateQueryCount === 1
                        ? createSubscriptionState({
                              plan_key: "polyglot",
                              has_active_subscription: true,
                              access_expires_at_ms: confirmedExpirationAtMs,
                          })
                        : { blocks_revenuecat_reconciliation: false };
                }
                throw new Error("Unexpected query in expiration reconciliation test");
            }),
            runMutation: jest.fn(async (_functionRef: unknown, mutationArgs: Record<string, unknown>) => {
                if (typeof mutationArgs.lease_duration_ms === "number") {
                    return {
                        status: "acquired",
                        revenuecat_app_user_id: "rc_user_1",
                        plan_key: "polyglot",
                        has_active_subscription: true,
                        last_synced_at_ms: 1_000,
                    };
                }
                if (mutationArgs.snapshot) {
                    return {
                        status: "updated",
                        plan_key: "free",
                        has_active_subscription: false,
                        last_synced_at_ms: 3_000,
                    };
                }
                throw new Error("Unexpected mutation in expiration reconciliation test");
            }),
        };

        await expect(reconcileExpiredSubscriptionStates(ctx as any)).resolves.toEqual({
            processed: 1,
            failed: 0,
            scanned: 1,
        });
    });

    it("moves sync collisions out of the current expiration batch", async () => {
        configureReadEnv();
        jest.spyOn(Date, "now").mockReturnValue(3_000);
        let subscriptionStateQueryCount = 0;
        const runMutation = jest.fn(async (_functionRef: unknown, mutationArgs: Record<string, unknown>) => {
            if (typeof mutationArgs.lease_duration_ms === "number") {
                return {
                    status: "in_progress",
                    revenuecat_app_user_id: "rc_user_1",
                    plan_key: "polyglot",
                    has_active_subscription: true,
                    last_synced_at_ms: 1_000,
                    retry_at_ms: 4_000,
                };
            }
            if (typeof mutationArgs.next_attempt_at_ms === "number") {
                return { status: "deferred" };
            }
            throw new Error("Unexpected mutation in expiration collision test");
        });
        const ctx = {
            runQuery: jest.fn(async (_functionRef: unknown, queryArgs: Record<string, unknown>) => {
                if (typeof queryArgs.limit === "number") {
                    return [{
                        user_id: "user_1",
                        last_synced_at_ms: 1_000,
                        expiration_reconciliation_at_ms: 2_000,
                        billing_cycle_end_at_ms: 2_000,
                    }];
                }
                if (queryArgs.model === "user") return { createdAt: 900 };
                if (queryArgs.user_id === "user_1") {
                    subscriptionStateQueryCount += 1;
                    return subscriptionStateQueryCount === 1
                        ? createSubscriptionState({
                              plan_key: "polyglot",
                              has_active_subscription: true,
                              billing_cycle_end_at_ms: 2_000,
                          })
                        : { blocks_revenuecat_reconciliation: false };
                }
                throw new Error("Unexpected query in expiration collision test");
            }),
            runMutation,
        };

        await expect(reconcileExpiredSubscriptionStates(ctx as any)).resolves.toEqual({
            processed: 0,
            failed: 0,
            scanned: 1,
        });
        expect(runMutation).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                user_id: "user_1",
                next_attempt_at_ms: 4_000,
            })
        );
    });

    it("skips a cron selection replaced before lease acquisition", async () => {
        configureReadEnv();
        jest.spyOn(Date, "now").mockReturnValue(3_000);
        const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;
        let subscriptionStateQueryCount = 0;
        const runMutation = jest.fn(async (_functionRef: unknown, mutationArgs: Record<string, unknown>) => {
            if (typeof mutationArgs.lease_duration_ms === "number") {
                return { status: "stale" };
            }
            throw new Error("Unexpected mutation in stale expiration selection test");
        });
        const ctx = {
            runQuery: jest.fn(async (_functionRef: unknown, queryArgs: Record<string, unknown>) => {
                if (typeof queryArgs.limit === "number") {
                    return [{
                        user_id: "user_1",
                        last_synced_at_ms: 1_000,
                        expiration_reconciliation_at_ms: 2_000,
                        billing_cycle_end_at_ms: 2_000,
                    }];
                }
                if (queryArgs.model === "user") return { createdAt: 900 };
                if (queryArgs.user_id === "user_1") {
                    subscriptionStateQueryCount += 1;
                    return subscriptionStateQueryCount === 1
                        ? createSubscriptionState({
                              plan_key: "polyglot",
                              has_active_subscription: true,
                              billing_cycle_end_at_ms: 4_000,
                              last_synced_at_ms: 2_000,
                          })
                        : { blocks_revenuecat_reconciliation: false };
                }
                throw new Error("Unexpected query in stale expiration selection test");
            }),
            runMutation,
        };

        await expect(reconcileExpiredSubscriptionStates(ctx as any)).resolves.toEqual({
            processed: 0,
            failed: 0,
            scanned: 1,
        });
        expect(runMutation).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                expected_last_synced_at_ms: 1_000,
                expected_expiration_reconciliation_at_ms: 2_000,
            })
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not report removed pre-lease cron work as a failure", async () => {
        configureReadEnv();
        jest.spyOn(Date, "now").mockReturnValue(3_000);
        const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;
        let subscriptionStateQueryCount = 0;
        const runMutation = jest.fn(async (_functionRef: unknown, mutationArgs: Record<string, unknown>) => {
            if (typeof mutationArgs.next_attempt_at_ms === "number") {
                return { status: "missing" };
            }
            throw new Error("Unexpected mutation in stale pre-lease cron test");
        });
        const ctx = {
            runQuery: jest.fn(async (_functionRef: unknown, queryArgs: Record<string, unknown>) => {
                if (typeof queryArgs.limit === "number") {
                    return [{
                        user_id: "user_1",
                        last_synced_at_ms: 1_000,
                        expiration_reconciliation_at_ms: 2_000,
                        billing_cycle_end_at_ms: 2_000,
                    }];
                }
                if (queryArgs.user_id === "user_1") {
                    subscriptionStateQueryCount += 1;
                    return subscriptionStateQueryCount === 1
                        ? createSubscriptionState({
                              plan_key: "polyglot",
                              has_active_subscription: true,
                              billing_cycle_end_at_ms: 2_000,
                          })
                        : { blocks_revenuecat_reconciliation: true };
                }
                throw new Error("Unexpected query in stale pre-lease cron test");
            }),
            runMutation,
        };

        await expect(reconcileExpiredSubscriptionStates(ctx as any)).resolves.toEqual({
            processed: 0,
            failed: 0,
            scanned: 1,
        });
        expect(runMutation).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                expected_last_synced_at_ms: 1_000,
                expected_expiration_reconciliation_at_ms: 2_000,
            })
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("honors RevenueCat retry-after beyond the renewal grace deadline", async () => {
        configureReadEnv();
        jest.spyOn(Date, "now").mockReturnValue(3_000);
        globalThis.fetch = jest.fn(async () => (({
            ok: false,
            status: 429,
            headers: { get: () => null },
            json: async () => ({ backoff_ms: 3_600_000 }),
        } as unknown) as Response)) as typeof fetch;
        let subscriptionStateQueryCount = 0;
        const runMutation = jest.fn(async (_functionRef: unknown, mutationArgs: Record<string, unknown>) => {
            if (typeof mutationArgs.lease_duration_ms === "number") {
                return {
                    status: "acquired",
                    revenuecat_app_user_id: "rc_user_1",
                    plan_key: "polyglot",
                    has_active_subscription: true,
                    last_synced_at_ms: 1_000,
                };
            }
            if (typeof mutationArgs.next_attempt_at_ms === "number") {
                return { status: "deferred" };
            }
            throw new Error("Unexpected mutation in expiration backoff test");
        });
        const ctx = {
            runQuery: jest.fn(async (_functionRef: unknown, queryArgs: Record<string, unknown>) => {
                if (typeof queryArgs.limit === "number") {
                    return [{
                        user_id: "user_1",
                        last_synced_at_ms: 1_000,
                        expiration_reconciliation_at_ms: 2_000,
                        billing_cycle_end_at_ms: 2_000,
                    }];
                }
                if (queryArgs.model === "user") return { createdAt: 900 };
                if (queryArgs.user_id === "user_1") {
                    subscriptionStateQueryCount += 1;
                    return subscriptionStateQueryCount === 1
                        ? createSubscriptionState({
                              plan_key: "polyglot",
                              has_active_subscription: true,
                              billing_cycle_end_at_ms: 2_000,
                          })
                        : { blocks_revenuecat_reconciliation: false };
                }
                throw new Error("Unexpected query in expiration backoff test");
            }),
            runMutation,
        };

        await expect(reconcileExpiredSubscriptionStates(ctx as any)).resolves.toEqual({
            processed: 0,
            failed: 1,
            scanned: 1,
        });
        expect(runMutation).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                user_id: "user_1",
                next_attempt_at_ms: 3_603_000,
            })
        );
    });

    it("skips expired-state reconciliation when active entitlement config is missing", async () => {
        configureReadEnv();
        process.env.REVENUECAT_POLYGLOT_ENTITLEMENT_ID = undefined;
        const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;
        const ctx = {
            runQuery: jest.fn(),
            runMutation: jest.fn(),
        };

        await expect(reconcileExpiredSubscriptionStates(ctx as any)).resolves.toEqual({
            processed: 0,
            failed: 0,
            skipped: "Missing REVENUECAT_POLYGLOT_ENTITLEMENT_ID",
        });

        expect(ctx.runQuery).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("pending activation scheduling", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("atomically schedules the first retry and expiry for an active signal", async () => {
        const scheduler = {
            runAfter: jest.fn(async (..._args: unknown[]) => null),
            runAt: jest.fn(async (..._args: unknown[]) => null),
        };
        const runMutation = jest.fn(async () => ({
            status: "acquired",
            revenuecat_app_user_id: "rc_user_1",
            plan_key: "free",
            has_active_subscription: false,
            last_synced_at_ms: 0,
            pending_active_signal_at_ms: 1_000,
            pending_active_expires_at_ms: 1_000 + PENDING_ACTIVE_SIGNAL_TTL_MS,
            pending_active_retry_count: 0,
            pending_active_next_retry_at_ms: 6_000,
        }));
        const ctx = { scheduler, runMutation };

        await beginSubscriptionStateReconciliationAndScheduleActivation(ctx as any, {
            user_id: "user_1",
            revenuecat_app_user_id: "rc_user_1",
            sync_attempt_id: "attempt_1",
            now_ms: 1_000,
            lease_duration_ms: 90_000,
            expects_active_subscription: true,
            active_signal_at_ms: 1_000,
            active_signal_ttl_ms: PENDING_ACTIVE_SIGNAL_TTL_MS,
            event_doc_id: "event_doc_1",
        });

        expect(runMutation).toHaveBeenCalledWith(
            expect.anything(),
            expect.not.objectContaining({ event_doc_id: expect.anything() })
        );
        expect(scheduler.runAt).toHaveBeenNthCalledWith(
            1,
            6_000,
            expect.anything(),
            {
                user_id: "user_1",
                active_signal_at_ms: 1_000,
                retry_index: 0,
                event_doc_id: "event_doc_1",
            }
        );
        expect(scheduler.runAt).toHaveBeenNthCalledWith(
            2,
            1_000 + PENDING_ACTIVE_SIGNAL_TTL_MS,
            expect.anything(),
            {
                user_id: "user_1",
                active_signal_at_ms: 1_000,
                event_doc_id: "event_doc_1",
            }
        );
    });

    it("does not schedule activation work for a reconciliation without an active signal", async () => {
        const scheduler = {
            runAfter: jest.fn(async () => null),
            runAt: jest.fn(async () => null),
        };
        const ctx = {
            scheduler,
            runMutation: jest.fn(async () => ({ status: "acquired" })),
        };

        await beginSubscriptionStateReconciliationAndScheduleActivation(ctx as any, {
            user_id: "user_1",
            revenuecat_app_user_id: "rc_user_1",
            sync_attempt_id: "attempt_1",
            now_ms: 1_000,
            lease_duration_ms: 90_000,
        });

        expect(scheduler.runAfter).not.toHaveBeenCalled();
        expect(scheduler.runAt).not.toHaveBeenCalled();
    });

    it("claims a retry and schedules both its worker and successor", async () => {
        jest.spyOn(Date, "now").mockReturnValue(6_000);
        const scheduler = {
            runAfter: jest.fn(async () => null),
            runAt: jest.fn(async () => null),
        };
        const ctx = {
            scheduler,
            runMutation: jest.fn(async () => ({
                claimed: true,
                next_retry_at_ms: 21_000,
            })),
        };

        await expect(tickPendingSubscriptionActivation(ctx as any, {
            user_id: "user_1",
            active_signal_at_ms: 1_000,
            retry_index: 0,
            event_doc_id: "event_doc_1",
        })).resolves.toEqual({ status: "claimed" });
        expect(scheduler.runAfter).toHaveBeenNthCalledWith(
            1,
            0,
            expect.anything(),
            {
                user_id: "user_1",
                active_signal_at_ms: 1_000,
                retry_index: 0,
                event_doc_id: "event_doc_1",
            }
        );
        expect(scheduler.runAt).toHaveBeenCalledWith(
            21_000,
            expect.anything(),
            {
                user_id: "user_1",
                active_signal_at_ms: 1_000,
                retry_index: 1,
                event_doc_id: "event_doc_1",
            }
        );
    });

    it("reschedules the same retry without dispatching a worker while a sync is active", async () => {
        jest.spyOn(Date, "now").mockReturnValue(6_000);
        const scheduler = {
            runAfter: jest.fn(async () => null),
            runAt: jest.fn(async () => null),
        };
        const ctx = {
            scheduler,
            runMutation: jest.fn(async () => ({
                claimed: false,
                sync_in_progress: true,
                retry_at_ms: 11_000,
            })),
        };
        const args = {
            user_id: "user_1",
            active_signal_at_ms: 1_000,
            retry_index: 0,
        };

        await expect(tickPendingSubscriptionActivation(ctx as any, args)).resolves.toEqual({
            status: "rescheduled",
            retry_at_ms: 11_000,
        });
        expect(scheduler.runAfter).not.toHaveBeenCalled();
        expect(scheduler.runAt).toHaveBeenCalledTimes(1);
        expect(scheduler.runAt).toHaveBeenCalledWith(
            11_000,
            expect.anything(),
            args
        );
    });

    it("dispatches the last worker without scheduling a sixth retry", async () => {
        jest.spyOn(Date, "now").mockReturnValue(231_000);
        const scheduler = {
            runAfter: jest.fn(async () => null),
            runAt: jest.fn(async () => null),
        };
        const ctx = {
            scheduler,
            runMutation: jest.fn(async () => ({
                claimed: true,
                next_retry_at_ms: 301_000,
            })),
        };

        await tickPendingSubscriptionActivation(ctx as any, {
            user_id: "user_1",
            active_signal_at_ms: 1_000,
            retry_index: 4,
        });

        expect(scheduler.runAfter).toHaveBeenCalledTimes(1);
        expect(scheduler.runAt).not.toHaveBeenCalled();
        expect(scheduler.runAfter).toHaveBeenCalledWith(
            0,
            expect.anything(),
            expect.objectContaining({ retry_index: 4 })
        );
    });

    it("cleans up expiry and wakes the originating webhook", async () => {
        jest.spyOn(Date, "now").mockReturnValue(301_000);
        const scheduler = {
            runAfter: jest.fn(async (..._args: unknown[]) => null),
            runAt: jest.fn(async (..._args: unknown[]) => null),
        };
        const ctx = {
            scheduler,
            runMutation: jest.fn(async () => ({ expired: true })),
        };

        await expect(expirePendingSubscriptionActivation(ctx as any, {
            user_id: "user_1",
            active_signal_at_ms: 1_000,
            event_doc_id: "event_doc_1",
        })).resolves.toEqual({ status: "expired" });
        expect(scheduler.runAfter).toHaveBeenCalledTimes(2);
        expect(scheduler.runAfter.mock.calls[0][2]).toMatchObject({
            kind: "subscription_activation_unconfirmed",
            entity_key: "user_1",
        });
        expect(scheduler.runAfter.mock.calls[1][2]).toEqual({
            event_doc_id: "event_doc_1",
        });
    });

    it("leaves webhook-resolved pending work stale", async () => {
        const scheduler = {
            runAfter: jest.fn(async () => null),
            runAt: jest.fn(async () => null),
        };
        const ctx = {
            scheduler,
            runMutation: jest.fn(async () => ({
                expired: false,
                stale: true,
            })),
        };

        await expect(expirePendingSubscriptionActivation(ctx as any, {
            user_id: "user_1",
            active_signal_at_ms: 1_000,
        })).resolves.toEqual({ status: "stale" });
        expect(scheduler.runAfter).not.toHaveBeenCalled();
    });

    it("wakes a superseded webhook when its expiry watchdog runs", async () => {
        const scheduler = {
            runAfter: jest.fn(async () => null),
            runAt: jest.fn(async () => null),
        };
        const ctx = {
            scheduler,
            runMutation: jest.fn(async () => ({
                expired: false,
                stale: true,
            })),
        };

        await expect(expirePendingSubscriptionActivation(ctx as any, {
            user_id: "user_1",
            active_signal_at_ms: 1_000,
            event_doc_id: "event_doc_1",
        })).resolves.toEqual({ status: "stale" });
        expect(scheduler.runAfter).toHaveBeenCalledWith(
            0,
            expect.anything(),
            { event_doc_id: "event_doc_1" }
        );
        expect(scheduler.runAt).not.toHaveBeenCalled();
    });
});

describe("usage refresh scheduling", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("schedules one worker only after acquiring the reconciliation lease", async () => {
        const scheduler = { runAfter: jest.fn(async () => null) };
        const acquiredCtx = {
            scheduler,
            runMutation: jest.fn(async () => ({ status: "acquired" })),
        };
        const args = {
            user_id: "user_1",
            revenuecat_app_user_id: "rc_user_1",
            sync_attempt_id: "attempt_1",
            now_ms: 1_000,
            lease_duration_ms: 90_000,
        };

        await beginSubscriptionStateReconciliationAndScheduleUsageRefresh(
            acquiredCtx as any,
            args
        );

        expect(scheduler.runAfter).toHaveBeenCalledWith(0, expect.anything(), {
            user_id: "user_1",
            sync_attempt_id: "attempt_1",
        });

        const blockedScheduler = { runAfter: jest.fn(async () => null) };
        await beginSubscriptionStateReconciliationAndScheduleUsageRefresh(
            {
                scheduler: blockedScheduler,
                runMutation: jest.fn(async () => ({ status: "in_progress" })),
            } as any,
            args
        );

        expect(blockedScheduler.runAfter).not.toHaveBeenCalled();
    });
});

describe("user deletion scheduling", () => {
    afterEach(() => {
        process.env = originalEnv;
        globalThis.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    it("does not schedule cleanup while preparing account deletion", async () => {
        process.env = {
            ...originalEnv,
            REVENUECAT_CI_SUBSCRIPTIONS_R_API_KEY: "rc_v2_secret",
            REVENUECAT_PROJECT_ID: "proj_test",
            REVENUECAT_POLYGLOT_ENTITLEMENT_ID: "entl_polyglot",
        };
        const fetchMock = jest.fn(async () => jsonResponse(200, { items: [] })) as jest.MockedFunction<
            typeof fetch
        >;
        globalThis.fetch = fetchMock;
        jest.spyOn(Date, "now").mockReturnValue(1_000);
        const scheduler = {
            runAfter: jest.fn(),
        };
        let userIdQueryCount = 0;
        const ctx = {
            scheduler,
            runQuery: jest.fn(async (_functionRef: unknown, queryArgs: Record<string, unknown>) => {
                if (queryArgs.model === "user") {
                    return {
                        createdAt: 900,
                    };
                }

                if (queryArgs.user_id === "user_1") {
                    userIdQueryCount += 1;

                    if (userIdQueryCount === 1) {
                        return null;
                    }

                    return {
                        has_active_subscription: false,
                        revenuecat_app_user_id: "rc_user_1",
                    };
                }

                throw new Error("Unexpected query in user deletion scheduling test");
            }),
            runMutation: jest.fn(async (_functionRef: unknown, mutationArgs: Record<string, unknown>) => {
                if (typeof mutationArgs.sync_attempt_id === "string") {
                    return {
                        status: "acquired",
                        revenuecat_app_user_id: "rc_user_1",
                        plan_key: "free",
                        has_active_subscription: false,
                        last_synced_at_ms: 1_000,
                    };
                }

                if (mutationArgs.snapshot) {
                    return {
                        status: "created",
                        plan_key: "free",
                        has_active_subscription: false,
                        last_synced_at_ms: 1_000,
                    };
                }

                if (mutationArgs.user_id === "user_1") {
                    return {};
                }

                throw new Error("Unexpected mutation in user deletion scheduling test");
            }),
        };

        await expect((prepareUserAccountDeletion as any)._handler(ctx, { user_id: "user_1" })).resolves.toMatchObject({
            repaired_missing_preserved_quota_period: false,
        });

        expect(scheduler.runAfter).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0][0])).toContain("/subscriptions?limit=100");
        expect(String(fetchMock.mock.calls[0][0])).not.toContain("/active_entitlements");
    });

    it("marks auth deletion and immediately schedules cleanup", async () => {
        jest.spyOn(Date, "now").mockReturnValue(1_000);
        const calls: string[] = [];
        const scheduler = {
            runAfter: jest.fn(async () => {
                calls.push("schedule");
            }),
        };
        const runMutation = jest.fn(async () => {
            calls.push("mark");
            return {};
        });

        await expect(
            (queueDeletedUserDataCleanup as any)._handler(
                {
                    scheduler,
                    runMutation,
                },
                { user_id: "user_1" }
            )
        ).resolves.toEqual({ status: "queued" });

        expect(runMutation).toHaveBeenCalledWith(expect.anything(), {
            user_id: "user_1",
            now_ms: 1_000,
        });
        expect(scheduler.runAfter).toHaveBeenCalledWith(0, expect.anything(), {
            user_id: "user_1",
        });
        expect(calls).toEqual(["mark", "schedule"]);
    });

    it("uses the cron retry when Better Auth deletion is not yet confirmed", async () => {
        jest.spyOn(Date, "now").mockReturnValue(1_000);
        const scheduler = {
            runAfter: jest.fn(),
        };
        const ctx = {
            scheduler,
            runQuery: jest.fn(async (_functionRef: unknown, queryArgs: Record<string, unknown>) => {
                if (queryArgs.model === "user") {
                    return {
                        createdAt: 900,
                    };
                }

                throw new Error("Unexpected query in auth deletion confirmation test");
            }),
            runMutation: jest.fn(async (_functionRef: unknown, mutationArgs: Record<string, unknown>) => {
                if (typeof mutationArgs.lease_expires_at_ms === "number") {
                    return {
                        acquired: true,
                        operation: {
                            started_at_ms: 900,
                            prepared_at_ms: 900,
                            has_active_subscription: false,
                            preserved_quota_period_id: "quota_1",
                            revenuecat_app_user_id: "rc_user_1",
                            retry_count: 0,
                        },
                    };
                }

                if (typeof mutationArgs.cleanup_attempt_id === "string") {
                    return {
                        updated: true,
                    };
                }

                throw new Error("Unexpected mutation in auth deletion confirmation test");
            }),
        };

        await expect(
            (finalizeDeletedUserData as any)._handler(ctx, { user_id: "user_1" })
        ).resolves.toEqual({
            status: "awaiting_auth_delete",
            next_retry_at_ms: 901_000,
        });

        expect(scheduler.runAfter).not.toHaveBeenCalled();
    });
});
