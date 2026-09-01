import { describe, expect, it } from "@jest/globals";

import { SUBSCRIPTION_PLAN_KEYS } from "@/constants/subscription";
import { parseConfirmedSubscriptionSnapshot } from "@/lib/confirmed-subscription-cache";

describe("confirmed subscription cache", () => {
    it("accepts a valid active snapshot", () => {
        expect(parseConfirmedSubscriptionSnapshot({
            version: 1,
            userId: "user-a",
            status: "active",
            planKey: SUBSCRIPTION_PLAN_KEYS.POLYGLOT,
            accessExpiresAtMs: 10_000,
            confirmedAtMs: 5_000,
        })).toMatchObject({
            userId: "user-a",
            status: "active",
            accessExpiresAtMs: 10_000,
        });
    });

    it("rejects malformed and unbounded active snapshots", () => {
        expect(parseConfirmedSubscriptionSnapshot(null)).toBeNull();
        expect(parseConfirmedSubscriptionSnapshot({
            version: 1,
            userId: "user-a",
            status: "active",
            planKey: SUBSCRIPTION_PLAN_KEYS.POLYGLOT,
            accessExpiresAtMs: null,
            confirmedAtMs: 5_000,
        })).toBeNull();
    });
});
