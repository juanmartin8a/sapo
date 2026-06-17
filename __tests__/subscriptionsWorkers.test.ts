import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { processRevenueCatWebhookEventById } from "../subscriptionsWorkers";
import { type CurrentSubscriptionState } from "../subscriptions/revenueCatApi";

const originalEnv = process.env;
const originalFetch = globalThis.fetch;
const PENDING_ACTIVE_SIGNAL_TTL_MS = 2 * 60 * 1000;

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
        stale_after_at_ms: 2_000,
        ...overrides,
    };
}

function createWebhookProcessingCtx(args: {
    event_at_ms: number;
    event_type?: string;
    existing_state: CurrentSubscriptionState | null;
    deletion_blocks?: boolean;
}) {
    const progressMutations: Record<string, unknown>[] = [];
    const leaseAcquisitionMutations: Record<string, unknown>[] = [];
    let subscriptionStateQueryCount = 0;
    let deletionStateQueryCount = 0;

    const ctx = {
        runQuery: jest.fn(async (_functionRef: unknown, queryArgs: Record<string, unknown>) => {
            if (typeof queryArgs.event_doc_id === "string") {
                return {
                    event_id: "evt_1",
                    event_type: args.event_type ?? "RENEWAL",
                    event_at_ms: args.event_at_ms,
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
                typeof mutationArgs.lease_duration_ms === "number"
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
                return {
                    status: "acquired",
                    revenuecat_app_user_id: "rc_user_1",
                    plan_key: args.existing_state?.plan_key ?? "free",
                    has_active_subscription: args.existing_state?.has_active_subscription ?? false,
                    last_synced_at_ms: args.existing_state?.last_synced_at_ms ?? 0,
                };
            }

            if (mutationArgs.snapshot) {
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
        getSubscriptionStateQueryCount: () => subscriptionStateQueryCount,
        getDeletionStateQueryCount: () => deletionStateQueryCount,
    };
}

describe("RevenueCat webhook worker processing", () => {
    afterEach(() => {
        process.env = originalEnv;
        globalThis.fetch = originalFetch;
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
    ])("fetches RevenueCat when %s", async (_name, existingState) => {
        process.env = {
            ...originalEnv,
            REVENUECAT_CI_SUBSCRIPTIONS_R_API_KEY: "rc_v2_secret",
            REVENUECAT_PROJECT_ID: "proj_test",
            REVENUECAT_POLYGLOT_ENTITLEMENT_ID: "polyglot",
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
        expect(progressMutations).toHaveLength(1);
        expect(progressMutations[0]).toMatchObject({
            processed_user_ids: ["user_1"],
            ignored_user_ids: [],
            processing_attempt_id: leaseAcquisitionMutations[0].processing_attempt_id,
        });
        expect(typeof leaseAcquisitionMutations[0].processing_attempt_id).toBe("string");
    });

    it("defers active webhooks while RevenueCat still reports inactive", async () => {
        jest.spyOn(Date, "now").mockReturnValue(1_500);
        process.env = {
            ...originalEnv,
            REVENUECAT_CI_SUBSCRIPTIONS_R_API_KEY: "rc_v2_secret",
            REVENUECAT_PROJECT_ID: "proj_test",
            REVENUECAT_POLYGLOT_ENTITLEMENT_ID: "polyglot",
        };
        const fetchMock = jest.fn(async () => jsonResponse(200, { items: [] })) as jest.MockedFunction<typeof fetch>;
        globalThis.fetch = fetchMock;
        const { ctx, progressMutations, leaseAcquisitionMutations } = createWebhookProcessingCtx({
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
    });

    it("processes stale active webhooks instead of deferring forever", async () => {
        process.env = {
            ...originalEnv,
            REVENUECAT_CI_SUBSCRIPTIONS_R_API_KEY: "rc_v2_secret",
            REVENUECAT_PROJECT_ID: "proj_test",
            REVENUECAT_POLYGLOT_ENTITLEMENT_ID: "polyglot",
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
});
