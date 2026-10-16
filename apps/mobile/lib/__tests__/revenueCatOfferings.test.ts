import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import Purchases, { type PurchasesPackage } from "react-native-purchases";

jest.mock("react-native-purchases", () => ({
    __esModule: true,
    default: {
        getOfferings: jest.fn(),
        getProducts: jest.fn(),
        PACKAGE_TYPE: { MONTHLY: "MONTHLY" },
        PRODUCT_CATEGORY: { SUBSCRIPTION: "SUBSCRIPTION" },
    },
}));

const getOfferings = jest.mocked(Purchases.getOfferings);
const getProducts = jest.mocked(Purchases.getProducts);
const originalProductId = process.env.EXPO_PUBLIC_IOS_SUBSCRIPTION_PRODUCT_ID;

function subscriptionPackage(offeringIdentifier: string, productId = "sapo_monthly") {
    return {
        identifier: "$rc_monthly",
        packageType: "MONTHLY",
        product: { identifier: productId },
        presentedOfferingContext: { offeringIdentifier },
    } as PurchasesPackage;
}

function loadOffering() {
    // Expo public configuration is captured when the integration module loads.
    let result!: ReturnType<typeof import("../revenuecat")["getRevenueCatSubscriptionOffering"]>;
    jest.isolateModules(() => {
        const { getRevenueCatSubscriptionOffering } = jest.requireActual<typeof import("../revenuecat")>("../revenuecat");
        result = getRevenueCatSubscriptionOffering();
    });
    return result;
}

function mockOfferings(currentPackages: PurchasesPackage[] | null, otherPackage: PurchasesPackage) {
    const current = currentPackages === null ? null : { availablePackages: currentPackages };
    getOfferings.mockResolvedValue({
        current,
        all: {
            other: { availablePackages: [otherPackage] },
            ...(current ? { assigned: current } : {}),
        },
    } as unknown as Awaited<ReturnType<typeof Purchases.getOfferings>>);
}

describe("RevenueCat offering selection", () => {
    beforeEach(() => {
        process.env.EXPO_PUBLIC_IOS_SUBSCRIPTION_PRODUCT_ID = "sapo_monthly";
        jest.clearAllMocks();
        jest.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
        if (originalProductId === undefined) {
            delete process.env.EXPO_PUBLIC_IOS_SUBSCRIPTION_PRODUCT_ID;
        } else {
            process.env.EXPO_PUBLIC_IOS_SUBSCRIPTION_PRODUCT_ID = originalProductId;
        }
        jest.restoreAllMocks();
    });

    it("preserves the assigned offering context when another offering contains the same product", async () => {
        const assignedPackage = subscriptionPackage("experiment");
        mockOfferings([assignedPackage], subscriptionPackage("default"));

        expect((await loadOffering()).subscriptionPackage).toBe(assignedPackage);
        expect(getProducts).not.toHaveBeenCalled();
    });

    it("uses the assigned monthly package instead of a configured product from another offering", async () => {
        const assignedPackage = subscriptionPackage("targeted", "sapo_targeted_monthly");
        mockOfferings([assignedPackage], subscriptionPackage("default"));

        expect((await loadOffering()).subscriptionPackage).toBe(assignedPackage);
    });

    it("prefers the configured product within the current offering", async () => {
        const configuredPackage = subscriptionPackage("targeted");
        mockOfferings(
            [subscriptionPackage("targeted", "other_monthly"), configuredPackage],
            subscriptionPackage("default")
        );

        expect((await loadOffering()).subscriptionPackage).toBe(configuredPackage);
    });

    it("uses the first current package when neither the configured product nor a monthly package is available", async () => {
        const annualPackage = {
            ...subscriptionPackage("targeted", "sapo_annual"),
            packageType: "ANNUAL" as PurchasesPackage["packageType"],
        };
        mockOfferings([annualPackage], subscriptionPackage("default"));

        expect((await loadOffering()).subscriptionPackage).toBe(annualPackage);
        expect(getProducts).not.toHaveBeenCalled();
    });

    it.each([null, []])("keeps the explicit product fallback when current packages are %p", async (packages) => {
        const fallbackProduct = subscriptionPackage("default").product;
        mockOfferings(packages, subscriptionPackage("unassigned"));
        getProducts.mockResolvedValue([fallbackProduct]);

        await expect(loadOffering()).resolves.toEqual({
            subscriptionPackage: null,
            subscriptionProduct: fallbackProduct,
        });
        expect(getProducts).toHaveBeenCalledWith(["sapo_monthly"], "SUBSCRIPTION");
    });

    it("does not select an arbitrary offering when there is no current offering or configured product", async () => {
        delete process.env.EXPO_PUBLIC_IOS_SUBSCRIPTION_PRODUCT_ID;
        mockOfferings(null, subscriptionPackage("unassigned"));

        await expect(loadOffering()).resolves.toEqual({
            subscriptionPackage: null,
            subscriptionProduct: null,
        });
        expect(getProducts).not.toHaveBeenCalled();
    });

    it("returns no purchase option when the configured fallback product is unavailable", async () => {
        mockOfferings(null, subscriptionPackage("unassigned"));
        getProducts.mockResolvedValue([]);

        await expect(loadOffering()).resolves.toEqual({
            subscriptionPackage: null,
            subscriptionProduct: null,
        });
    });
});
