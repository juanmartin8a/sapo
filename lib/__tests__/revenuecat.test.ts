import { describe, expect, it, jest } from "@jest/globals";
import type {
    PurchasesEntitlementInfo,
    PurchasesSubscriptionInfo,
} from "react-native-purchases";

import {
    hasCurrentRevenueCatEntitlementAccess,
    hasCurrentRevenueCatProductAccess,
} from "@/lib/revenuecat";

jest.mock("react-native-purchases", () => ({
    __esModule: true,
    default: {},
}));

function entitlement(
    overrides: Partial<PurchasesEntitlementInfo> = {}
): PurchasesEntitlementInfo {
    return {
        isActive: true,
        expirationDateMillis: 6_000,
        ...overrides,
    } as PurchasesEntitlementInfo;
}

function subscription(
    overrides: Partial<PurchasesSubscriptionInfo> = {}
): PurchasesSubscriptionInfo {
    return {
        isActive: true,
        expiresDate: new Date(6_000).toISOString(),
        gracePeriodExpiresDate: null,
        ...overrides,
    } as PurchasesSubscriptionInfo;
}

describe("RevenueCat entitlement access", () => {
    it("accepts active unexpired and lifetime entitlements", () => {
        expect(hasCurrentRevenueCatEntitlementAccess(entitlement(), 5_000)).toBe(true);
        expect(
            hasCurrentRevenueCatEntitlementAccess(
                entitlement({ expirationDateMillis: null }),
                5_000
            )
        ).toBe(true);
    });

    it("rejects inactive and expired entitlements", () => {
        expect(
            hasCurrentRevenueCatEntitlementAccess(entitlement({ isActive: false }), 5_000)
        ).toBe(false);
        expect(
            hasCurrentRevenueCatEntitlementAccess(
                entitlement({ expirationDateMillis: 5_000 }),
                5_000
            )
        ).toBe(false);
    });

    it("accepts product access through the end of a grace period", () => {
        expect(
            hasCurrentRevenueCatProductAccess(
                subscription({
                    expiresDate: new Date(4_000).toISOString(),
                    gracePeriodExpiresDate: new Date(6_000).toISOString(),
                }),
                5_000
            )
        ).toBe(true);
    });

    it("rejects inactive and expired product subscriptions", () => {
        expect(
            hasCurrentRevenueCatProductAccess(subscription({ isActive: false }), 5_000)
        ).toBe(false);
        expect(
            hasCurrentRevenueCatProductAccess(
                subscription({ expiresDate: new Date(5_000).toISOString() }),
                5_000
            )
        ).toBe(false);
    });
});
