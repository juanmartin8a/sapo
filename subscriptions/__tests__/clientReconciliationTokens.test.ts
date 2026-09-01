import { describe, expect, it, jest } from "@jest/globals";

import {
    claimPendingActiveRetry,
    deferSubscriptionStateReconciliation,
    expirePendingActiveSignal,
    getClientReconciliationTokenState,
    isActiveReconciliationSuperseded,
    listSubscriptionStatesDueForExpirationReconciliation,
    releaseSubscriptionStateReconciliation,
} from "../model/webhook";

function createPendingStateCtx(state: Record<string, unknown> | null) {
    const patch = jest.fn(async (..._args: unknown[]) => null);
    const ctx = {
        db: {
            query: jest.fn(() => ({
                withIndex: jest.fn(() => ({
                    order: jest.fn(() => ({ first: jest.fn(async () => state) })),
                })),
            })),
            patch,
        },
    };

    return { ctx, patch };
}

describe("client subscription reconciliation tokens", () => {
    it("starts with the full capacity", () => {
        expect(getClientReconciliationTokenState(null, 1_000)).toEqual({
            tokens: 3,
            refilled_at_ms: 1_000,
            retry_at_ms: 1_000 + 60 * 60 * 1000,
        });
    });

    it("refills one token per hour up to capacity", () => {
        const state = {
            client_reconcile_tokens: 0,
            client_reconcile_refilled_at_ms: 1_000,
        };

        expect(
            getClientReconciliationTokenState(state, 1_000 + 2 * 60 * 60 * 1000)
        ).toEqual({
            tokens: 2,
            refilled_at_ms: 1_000 + 2 * 60 * 60 * 1000,
            retry_at_ms: 1_000 + 3 * 60 * 60 * 1000,
        });

        expect(
            getClientReconciliationTokenState(state, 1_000 + 10 * 60 * 60 * 1000).tokens
        ).toBe(3);
    });

    it("clears an expired activation so reactive clients leave activating state", async () => {
        const state = {
            _id: "state_1",
            has_active_subscription: false,
            pending_active_signal_at_ms: 1_000,
            pending_active_expires_at_ms: 2_000,
            pending_active_retry_count: 2,
        };
        const { ctx, patch } = createPendingStateCtx(state);

        await expect(claimPendingActiveRetry(ctx as any, {
            user_id: "user_1",
            active_signal_at_ms: 1_000,
            retry_index: 2,
            now_ms: 2_000,
            next_retry_at_ms: 3_000,
        })).resolves.toEqual({ claimed: false, expired: true });
        expect(patch).toHaveBeenCalledWith("subscription_states", "state_1", expect.objectContaining({
            pending_active_signal_at_ms: undefined,
            pending_active_expires_at_ms: undefined,
            pending_active_retry_count: undefined,
            pending_active_next_retry_at_ms: undefined,
        }));
    });

    it("does not consume a retry while another reconciliation owns the lease", async () => {
        const { ctx, patch } = createPendingStateCtx({
            _id: "state_1",
            pending_active_signal_at_ms: 1_000,
            pending_active_expires_at_ms: 10_000,
            pending_active_retry_count: 0,
            pending_active_next_retry_at_ms: 2_000,
            sync_attempt_id: "other_attempt",
            sync_expires_at_ms: 8_000,
        });

        await expect(claimPendingActiveRetry(ctx as any, {
            user_id: "user_1",
            active_signal_at_ms: 1_000,
            retry_index: 0,
            now_ms: 2_000,
            next_retry_at_ms: 5_000,
        })).resolves.toEqual({
            claimed: false,
            sync_in_progress: true,
            retry_at_ms: 7_000,
        });
        expect(patch).toHaveBeenCalledWith(
            "subscription_states",
            "state_1",
            expect.objectContaining({
                pending_active_next_retry_at_ms: 7_000,
            })
        );
        expect(patch.mock.calls[0][2]).not.toHaveProperty("pending_active_retry_count");
    });

    it("keeps an early retry at the persisted deadline", async () => {
        const { ctx, patch } = createPendingStateCtx({
            _id: "state_1",
            pending_active_signal_at_ms: 1_000,
            pending_active_expires_at_ms: 10_000,
            pending_active_retry_count: 0,
            pending_active_next_retry_at_ms: 3_000,
        });

        await expect(claimPendingActiveRetry(ctx as any, {
            user_id: "user_1",
            active_signal_at_ms: 1_000,
            retry_index: 0,
            now_ms: 2_000,
            next_retry_at_ms: 5_000,
        })).resolves.toEqual({
            claimed: false,
            not_due: true,
            retry_at_ms: 3_000,
        });
        expect(patch).not.toHaveBeenCalled();
    });

    it("claims a due retry and persists its successor deadline", async () => {
        const { ctx, patch } = createPendingStateCtx({
            _id: "state_1",
            pending_active_signal_at_ms: 1_000,
            pending_active_expires_at_ms: 10_000,
            pending_active_retry_count: 1,
            pending_active_next_retry_at_ms: 2_000,
        });

        await expect(claimPendingActiveRetry(ctx as any, {
            user_id: "user_1",
            active_signal_at_ms: 1_000,
            retry_index: 1,
            now_ms: 2_000,
            next_retry_at_ms: 5_000,
        })).resolves.toEqual({
            claimed: true,
            next_retry_at_ms: 5_000,
        });
        expect(patch).toHaveBeenCalledWith(
            "subscription_states",
            "state_1",
            expect.objectContaining({
                pending_active_retry_count: 2,
                pending_active_next_retry_at_ms: 5_000,
            })
        );
    });

    it("expires only the matching pending activation generation", async () => {
        const { ctx, patch } = createPendingStateCtx({
            _id: "state_1",
            pending_active_signal_at_ms: 1_000,
            pending_active_expires_at_ms: 2_000,
            pending_active_retry_count: 4,
        });

        await expect(expirePendingActiveSignal(ctx as any, {
            user_id: "user_1",
            active_signal_at_ms: 1_000,
            now_ms: 2_000,
        })).resolves.toEqual({ expired: true });
        expect(patch).toHaveBeenCalledWith(
            "subscription_states",
            "state_1",
            expect.objectContaining({
                pending_active_signal_at_ms: undefined,
                pending_active_expires_at_ms: undefined,
                pending_active_retry_count: undefined,
                pending_active_next_retry_at_ms: undefined,
            })
        );
    });

    it("leaves a newer generation untouched when an old expiry runs", async () => {
        const { ctx, patch } = createPendingStateCtx({
            _id: "state_1",
            pending_active_signal_at_ms: 2_000,
            pending_active_expires_at_ms: 4_000,
        });

        await expect(expirePendingActiveSignal(ctx as any, {
            user_id: "user_1",
            active_signal_at_ms: 1_000,
            now_ms: 3_000,
        })).resolves.toEqual({ expired: false, stale: true });
        expect(patch).not.toHaveBeenCalled();
    });

    it("stores refresh backoff when releasing reconciliation", async () => {
        const { ctx, patch } = createPendingStateCtx({
            _id: "state_1",
            has_active_subscription: true,
            access_expires_at_ms: 4_000,
            sync_attempt_id: "attempt_1",
            sync_expires_at_ms: 2_000,
            updated_at_ms: 900,
        });

        await expect(releaseSubscriptionStateReconciliation(ctx as any, {
            user_id: "user_1",
            sync_attempt_id: "attempt_1",
            now_ms: 1_000,
            next_attempt_at_ms: 5_000,
        })).resolves.toEqual({ status: "released" });

        expect(patch).toHaveBeenCalledWith(
            "subscription_states",
            "state_1",
            expect.objectContaining({
                sync_attempt_id: undefined,
                expiration_reconciliation_at_ms: 5_000,
                next_refresh_attempt_at_ms: 5_000,
            })
        );
    });

    it("does not defer a state replaced by a newer reconciliation", async () => {
        const { ctx, patch } = createPendingStateCtx({
            _id: "state_1",
            last_synced_at_ms: 2_000,
        });

        await expect(deferSubscriptionStateReconciliation(ctx as any, {
            user_id: "user_1",
            expected_last_synced_at_ms: 1_000,
            next_attempt_at_ms: 5_000,
        })).resolves.toEqual({ status: "stale" });

        expect(patch).not.toHaveBeenCalled();
    });

    it("moves a failed expiration reconciliation behind its retry window", async () => {
        const { ctx, patch } = createPendingStateCtx({
            _id: "state_1",
            has_active_subscription: true,
            access_expires_at_ms: 4_000,
            last_synced_at_ms: 1_000,
        });

        await expect(deferSubscriptionStateReconciliation(ctx as any, {
            user_id: "user_1",
            expected_last_synced_at_ms: 1_000,
            next_attempt_at_ms: 5_000,
        })).resolves.toEqual({ status: "deferred" });

        expect(patch).toHaveBeenCalledWith(
            "subscription_states",
            "state_1",
            expect.objectContaining({
                expiration_reconciliation_at_ms: 5_000,
                next_refresh_attempt_at_ms: 5_000,
            })
        );
    });

    it("reschedules an expiry invocation that arrives early", async () => {
        const { ctx, patch } = createPendingStateCtx({
            _id: "state_1",
            pending_active_signal_at_ms: 1_000,
            pending_active_expires_at_ms: 4_000,
        });

        await expect(expirePendingActiveSignal(ctx as any, {
            user_id: "user_1",
            active_signal_at_ms: 1_000,
            now_ms: 3_000,
        })).resolves.toEqual({
            expired: false,
            retry_at_ms: 4_000,
        });
        expect(patch).not.toHaveBeenCalled();
    });

    it("rejects an active result superseded by a newer inactive event", () => {
        expect(isActiveReconciliationSuperseded({
            expects_active_subscription: true,
            active_signal_at_ms: 1_000,
            pending_active_superseded_at_ms: 2_000,
        })).toBe(true);
        expect(isActiveReconciliationSuperseded({
            expects_active_subscription: true,
            active_signal_at_ms: 3_000,
            pending_active_superseded_at_ms: 2_000,
        })).toBe(false);
    });
});

describe("subscription expiration reconciliation", () => {
    it("lists active states whose expiration reconciliation is due", async () => {
        const range = {
            eq: jest.fn(),
            gte: jest.fn(),
            lte: jest.fn(),
        };
        range.eq.mockReturnValue(range);
        range.gte.mockReturnValue(range);
        range.lte.mockReturnValue(range);
        const take = jest.fn(async () => [{
            user_id: "user_1",
            last_synced_at_ms: 1_000,
        }]);
        const withIndex = jest.fn((_indexName: string, buildRange: (query: typeof range) => unknown) => {
            buildRange(range);
            return { take };
        });
        const ctx = {
            db: {
                query: jest.fn(() => ({ withIndex })),
            },
        };

        await expect(listSubscriptionStatesDueForExpirationReconciliation(ctx as any, {
            now_ms: 2_000,
            limit: 100,
        })).resolves.toEqual([{
            user_id: "user_1",
            last_synced_at_ms: 1_000,
        }]);

        expect(withIndex).toHaveBeenCalledWith(
            "by_active_subscription_and_expiration_reconciliation_at_ms",
            expect.any(Function)
        );
        expect(range.eq).toHaveBeenCalledWith("has_active_subscription", true);
        expect(range.gte).toHaveBeenCalledWith("expiration_reconciliation_at_ms", 0);
        expect(range.lte).toHaveBeenCalledWith("expiration_reconciliation_at_ms", 2_000);
        expect(take).toHaveBeenCalledWith(50);
    });
});
