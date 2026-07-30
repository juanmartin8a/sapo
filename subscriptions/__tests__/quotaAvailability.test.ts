import { describe, expect, it } from "@jest/globals";

import { shouldBlockQuotaUsageForPeriod } from "../model/quotaAvailability";

describe("quota availability", () => {
    it("allows a request that ends at the period limit", () => {
        expect(
            shouldBlockQuotaUsageForPeriod({
                used_chars: 900,
                requested_chars: 100,
                period_limit: 1_000,
            })
        ).toBe(false);
    });

    it("blocks requests that would exceed the period limit", () => {
        expect(
            shouldBlockQuotaUsageForPeriod({
                used_chars: 900,
                requested_chars: 101,
                period_limit: 1_000,
            })
        ).toBe(true);

        expect(
            shouldBlockQuotaUsageForPeriod({
                used_chars: 1_000,
                requested_chars: 1,
                period_limit: 1_000,
            })
        ).toBe(true);
    });
});
