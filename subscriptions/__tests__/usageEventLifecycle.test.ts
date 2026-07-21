import { describe, expect, it, jest } from "@jest/globals";

import {
    canCompleteUsageEvent,
    finalizeStaleUsageEvent,
    resolveStaleUsageEventTransition,
    resolveUsageEventFailureTransition,
} from "../usageEventLifecycle";

describe("usage event lifecycle", () => {
    it("only completes charged usage", () => {
        expect(canCompleteUsageEvent({ state: "processing", quota_state: "charged" })).toBe(true);
        expect(canCompleteUsageEvent({ state: "indeterminate", quota_state: "charged" })).toBe(true);
        expect(canCompleteUsageEvent({ state: "processing", quota_state: "reserved" })).toBe(false);
    });

    it("releases an uncharged failure and preserves a charge", () => {
        expect(
            resolveUsageEventFailureTransition({ state: "processing", quota_state: "reserved" })
        ).toEqual({ state: "failed", quota_state: "released" });
        expect(
            resolveUsageEventFailureTransition({ state: "processing", quota_state: "charged" })
        ).toEqual({ state: "failed", quota_state: "charged" });
    });

    it("lets the watchdog mark charged usage indeterminate", () => {
        expect(
            resolveStaleUsageEventTransition({ state: "processing", quota_state: "reserved" })
        ).toEqual({ state: "failed", quota_state: "released" });
        expect(
            resolveStaleUsageEventTransition({ state: "processing", quota_state: "charged" })
        ).toEqual({ state: "indeterminate", quota_state: "charged" });
    });

    it("lets a watchdog job safely receive an event deleted by account cleanup", async () => {
        const patch = jest.fn();
        const ctx = {
            db: {
                get: async () => null,
                patch,
            },
        } as never;

        await expect(
            finalizeStaleUsageEvent(ctx, {
                usage_event_id: "deleted_event" as never,
                now_ms: 301_000,
                watchdog_delay_ms: 300_000,
            })
        ).resolves.toEqual({ status: "missing" });
        expect(patch).not.toHaveBeenCalled();
    });

    it("applies the charged watchdog transition to the stored event", async () => {
        const patches: unknown[] = [];
        const ctx = {
            db: {
                get: async () => ({
                    _id: "usage_event_1",
                    state: "processing",
                    quota_state: "charged",
                    reserved_at_ms: 1_000,
                }),
                patch: async (_id: string, patch: unknown) => {
                    patches.push(patch);
                },
            },
        } as never;

        await expect(
            finalizeStaleUsageEvent(ctx, {
                usage_event_id: "usage_event_1" as never,
                now_ms: 301_000,
                watchdog_delay_ms: 300_000,
            })
        ).resolves.toEqual({ status: "stale_charged_marked_indeterminate" });
        expect(patches).toEqual([
            {
                state: "indeterminate",
                indeterminate_at_ms: 301_000,
                updated_at_ms: 301_000,
            },
        ]);
    });
});
