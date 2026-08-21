import { describe, expect, it, jest } from "@jest/globals";

import {
    claimPendingActiveRetry,
    expirePendingActiveSignal,
    getClientReconciliationTokenState,
    isActiveReconciliationSuperseded,
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
