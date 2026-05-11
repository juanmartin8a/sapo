import { describe, expect, it } from "@jest/globals";

import {
    buildUsageEventQuotaAppliedPatch,
    shouldApplyUsageEventChargeBeforeDeletion,
} from "../usageEventChargeApplication";

describe("usage event charge application helpers", () => {
    it("applies charged preserved usage before deletion when quota is still unapplied", () => {
        expect(
            shouldApplyUsageEventChargeBeforeDeletion({
                matches_preserved_logical_window: true,
                is_charged: true,
            })
        ).toBe(true);
    });

    it("skips deletion-time application for already applied or unpreserved usage", () => {
        expect(
            shouldApplyUsageEventChargeBeforeDeletion({
                matches_preserved_logical_window: false,
                is_charged: true,
            })
        ).toBe(false);

        expect(
            shouldApplyUsageEventChargeBeforeDeletion({
                matches_preserved_logical_window: true,
                is_charged: false,
            })
        ).toBe(false);

        expect(
            shouldApplyUsageEventChargeBeforeDeletion({
                matches_preserved_logical_window: true,
                is_charged: true,
                quota_applied_at_ms: 123,
            })
        ).toBe(false);
    });

    it("marks reserved charged usage as applied and promotes it to processing", () => {
        expect(
            buildUsageEventQuotaAppliedPatch({
                state: "reserved",
                charged_units: 42,
                now_ms: 1_000,
            })
        ).toEqual({
            state: "processing",
            charged_units: 42,
            charged_at_ms: 1_000,
            quota_applied_at_ms: 1_000,
            updated_at_ms: 1_000,
        });
    });

    it("preserves an existing charged timestamp for non-reserved usage", () => {
        expect(
            buildUsageEventQuotaAppliedPatch({
                state: "user_stopped_after_charge",
                charged_units: 17,
                charged_at_ms: 900,
                now_ms: 1_000,
            })
        ).toEqual({
            charged_units: 17,
            charged_at_ms: 900,
            quota_applied_at_ms: 1_000,
            updated_at_ms: 1_000,
        });
    });
});
