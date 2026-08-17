import { describe, expect, it, jest } from "@jest/globals";

import {
    claimPendingActiveRetry,
    getClientReconciliationTokenState,
    isActiveReconciliationSuperseded,
} from "../model/webhook";

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
        const patch = jest.fn(async () => null);
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
