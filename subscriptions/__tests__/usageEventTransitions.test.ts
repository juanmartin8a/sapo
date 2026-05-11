import { describe, expect, it } from "@jest/globals";

import { canTransitionUsageEventToAfterChargeTerminalState } from "../usageEventTransitions";

describe("usage event after-charge transitions", () => {
    it("allows after-charge terminal transitions only from charged processing usage", () => {
        expect(
            canTransitionUsageEventToAfterChargeTerminalState({
                state: "processing",
                is_charged: true,
            })
        ).toBe(true);

        expect(
            canTransitionUsageEventToAfterChargeTerminalState({
                state: "processing",
                is_charged: false,
            })
        ).toBe(false);

        expect(
            canTransitionUsageEventToAfterChargeTerminalState({
                state: "failed_after_charge",
                is_charged: true,
            })
        ).toBe(false);

        expect(
            canTransitionUsageEventToAfterChargeTerminalState({
                state: "user_stopped_after_charge",
                is_charged: true,
            })
        ).toBe(false);
    });
});
