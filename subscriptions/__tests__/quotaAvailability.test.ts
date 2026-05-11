import { describe, expect, it } from "@jest/globals";

import { shouldBlockQuotaUsageForPeriod } from "../quotaAvailability";

describe("quota availability", () => {
    it("allows a request that starts before the period limit", () => {
        expect(
            shouldBlockQuotaUsageForPeriod({
                used_chars: 999,
                period_limit: 1_000,
            })
        ).toBe(false);
    });

    it("blocks only once used quota has reached the period limit", () => {
        expect(
            shouldBlockQuotaUsageForPeriod({
                used_chars: 1_000,
                period_limit: 1_000,
            })
        ).toBe(true);

        expect(
            shouldBlockQuotaUsageForPeriod({
                used_chars: 1_001,
                period_limit: 1_000,
            })
        ).toBe(true);
    });
});
