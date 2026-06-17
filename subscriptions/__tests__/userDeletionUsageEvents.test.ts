import { describe, expect, it } from "@jest/globals";

import { resolveForcedStoppedUsageEventTransition } from "../userDeletionUsageEvents";

describe("user deletion usage event transitions", () => {
    it("forces reserved usage events into the before-charge stopped state", () => {
        expect(
            resolveForcedStoppedUsageEventTransition({
                state: "reserved",
                held_units: 12,
                is_charged: false,
                now_ms: 1_000,
            })
        ).toEqual({
            state: "user_stopped_before_charge",
            stopped_at_ms: 1_000,
            updated_at_ms: 1_000,
        });
    });

    it("forces charged processing usage events into the after-charge stopped state", () => {
        expect(
            resolveForcedStoppedUsageEventTransition({
                state: "processing",
                held_units: 34,
                is_charged: true,
                charged_at_ms: 900,
                stopped_at_ms: 950,
                now_ms: 1_000,
            })
        ).toEqual({
            state: "user_stopped_after_charge",
            charged_units: 34,
            charged_at_ms: 900,
            stopped_at_ms: 950,
            updated_at_ms: 1_000,
        });
    });

    it("forces uncharged processing usage events into the before-charge stopped state", () => {
        expect(
            resolveForcedStoppedUsageEventTransition({
                state: "processing",
                held_units: 21,
                is_charged: false,
                now_ms: 1_000,
            })
        ).toEqual({
            state: "user_stopped_before_charge",
            stopped_at_ms: 1_000,
            updated_at_ms: 1_000,
        });
    });
});
