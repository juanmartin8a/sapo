import { describe, expect, it } from "@jest/globals";

import {
    hasQuotaSubsystemHistory,
    resolveAnonymousFreeMergeAuthority,
    resolveCanonicalFreeAnchorAtMs,
    resolvePreferredFreeAnchorAtMs,
    resolveRebucketedFreeUsageWindow,
} from "../anonymousMerge";

describe("anonymous free merge helpers", () => {
    it("treats a bare empty free state as no quota history", () => {
        expect(
            hasQuotaSubsystemHistory({
                state: {
                    plan_key: "free",
                    has_active_subscription: false,
                    free_period_anchor_at_ms: Date.UTC(2026, 3, 5),
                    window_start_at_ms: Date.UTC(2026, 3, 5),
                    window_end_at_ms: Date.UTC(2026, 4, 5),
                    translate_chars_used: 0,
                    respell_chars_used: 0,
                },
                quotaPeriods: [],
                usageEvents: [],
            })
        ).toBe(false);
    });

    it("treats usage history as quota history", () => {
        expect(
            hasQuotaSubsystemHistory({
                state: null,
                quotaPeriods: [
                    {
                        plan_key: "free",
                        active_subscription: false,
                        window_type: "anchored_monthly",
                        period_start_at_ms: Date.UTC(2026, 2, 25),
                        period_end_at_ms: Date.UTC(2026, 3, 25),
                    },
                ],
                usageEvents: [],
            })
        ).toBe(true);
    });

    it("prefers the anonymous timeline only when the target has no subsystem history", () => {
        expect(
            resolveAnonymousFreeMergeAuthority({
                targetState: {
                    plan_key: "free",
                    has_active_subscription: false,
                    free_period_anchor_at_ms: Date.UTC(2026, 3, 25),
                    window_start_at_ms: Date.UTC(2026, 3, 25),
                    window_end_at_ms: Date.UTC(2026, 4, 25),
                    translate_chars_used: 0,
                    respell_chars_used: 0,
                },
                targetQuotaPeriods: [],
                targetUsageEvents: [],
            })
        ).toBe("source");

        expect(
            resolveAnonymousFreeMergeAuthority({
                targetState: {
                    plan_key: "free",
                    has_active_subscription: false,
                    free_period_anchor_at_ms: Date.UTC(2026, 3, 25),
                    window_start_at_ms: Date.UTC(2026, 3, 25),
                    window_end_at_ms: Date.UTC(2026, 4, 25),
                    translate_chars_used: 100,
                    respell_chars_used: 0,
                },
                targetQuotaPeriods: [],
                targetUsageEvents: [],
            })
        ).toBe("target");
    });

    it("derives the preferred free anchor from free state, free periods, and paid history", () => {
        expect(
            resolvePreferredFreeAnchorAtMs({
                state: {
                    plan_key: "free",
                    has_active_subscription: false,
                    free_period_anchor_at_ms: Date.UTC(2026, 3, 25),
                    window_start_at_ms: Date.UTC(2026, 3, 25),
                    window_end_at_ms: Date.UTC(2026, 4, 25),
                },
                quotaPeriods: [],
            })
        ).toBe(Date.UTC(2026, 3, 25));

        expect(
            resolvePreferredFreeAnchorAtMs({
                state: null,
                quotaPeriods: [
                    {
                        plan_key: "free",
                        active_subscription: false,
                        window_type: "anchored_monthly",
                        period_start_at_ms: Date.UTC(2026, 3, 5),
                        period_end_at_ms: Date.UTC(2026, 4, 5),
                    },
                ],
            })
        ).toBe(Date.UTC(2026, 3, 5));

        expect(
            resolvePreferredFreeAnchorAtMs({
                state: null,
                quotaPeriods: [
                    {
                        plan_key: "polyglot",
                        active_subscription: true,
                        window_type: "billing_cycle",
                        period_start_at_ms: Date.UTC(2026, 2, 1),
                        period_end_at_ms: Date.UTC(2026, 2, 31),
                    },
                ],
            })
        ).toBe(Date.UTC(2026, 2, 31));
    });

    it("falls back to the other side when the chosen source is missing a free anchor", () => {
        expect(
            resolveCanonicalFreeAnchorAtMs({
                authority: "source",
                sourceState: null,
                targetState: {
                    plan_key: "free",
                    has_active_subscription: false,
                    free_period_anchor_at_ms: Date.UTC(2026, 3, 25),
                    window_start_at_ms: Date.UTC(2026, 3, 25),
                    window_end_at_ms: Date.UTC(2026, 4, 25),
                },
                sourceQuotaPeriods: [],
                targetQuotaPeriods: [],
            })
        ).toBe(Date.UTC(2026, 3, 25));
    });

    it("rebuckets anonymous usage into the target anchored monthly windows", () => {
        const targetAnchorAtMs = Date.UTC(2026, 2, 25, 0, 0, 0, 0);

        expect(
            resolveRebucketedFreeUsageWindow({
                free_period_anchor_at_ms: targetAnchorAtMs,
                event: { reserved_at_ms: Date.UTC(2026, 3, 8, 12, 0, 0, 0) },
            })
        ).toMatchObject({
            window_start_at_ms: Date.UTC(2026, 2, 25, 0, 0, 0, 0),
            window_end_at_ms: Date.UTC(2026, 3, 25, 0, 0, 0, 0),
        });

        expect(
            resolveRebucketedFreeUsageWindow({
                free_period_anchor_at_ms: targetAnchorAtMs,
                event: { reserved_at_ms: Date.UTC(2026, 3, 28, 12, 0, 0, 0) },
            })
        ).toMatchObject({
            window_start_at_ms: Date.UTC(2026, 3, 25, 0, 0, 0, 0),
            window_end_at_ms: Date.UTC(2026, 4, 25, 0, 0, 0, 0),
        });
    });
});
