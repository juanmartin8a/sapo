import Purchases, {
    type PurchasesError,
    type PurchasesPackage,
    type PurchasesStoreProduct,
} from "react-native-purchases";

import { getRevenueCatSubscriptionProductId } from "@/lib/revenuecat";

export const getAvailablePackagesFromOfferings = (
    offerings: Awaited<ReturnType<typeof Purchases.getOfferings>>
) => {
    const currentPackages = offerings.current?.availablePackages ?? [];
    const allPackages = Object.values(offerings.all).flatMap(
        (offering) => offering.availablePackages
    );
    const configuredProductId = getRevenueCatSubscriptionProductId();

    if (configuredProductId.length > 0) {
        const configuredPackage = allPackages.find(
            (item) => item.product.identifier === configuredProductId
        );

        if (configuredPackage) {
            return { selectedPackage: configuredPackage, allPackages, currentPackages };
        }
    }

    const packages = currentPackages.length > 0 ? currentPackages : allPackages;
    const monthlyPackage = packages.find(
        (item) => item.packageType === Purchases.PACKAGE_TYPE.MONTHLY
    );

    return {
        selectedPackage: monthlyPackage ?? packages[0] ?? null,
        allPackages,
        currentPackages,
    };
};

const getProductBillingPeriodLabel = (subscriptionProduct: PurchasesStoreProduct | null) => {
    const match = subscriptionProduct?.subscriptionPeriod?.match(/^P(\d+)([WMY])$/);

    if (!match) {
        return null;
    }

    const count = Number(match[1]);
    const unit = match[2] === "W" ? "week" : match[2] === "M" ? "month" : "year";
    return `/ ${count === 1 ? unit : `${count} ${unit}s`}`;
};

export const getPackageBillingPeriodLabel = (
    subscriptionPackage: PurchasesPackage | null,
    subscriptionProduct: PurchasesStoreProduct | null
) => {
    if (!subscriptionPackage) {
        return getProductBillingPeriodLabel(subscriptionProduct) ?? "/ month";
    }

    switch (subscriptionPackage.packageType) {
        case Purchases.PACKAGE_TYPE.WEEKLY:
            return "/ week";
        case Purchases.PACKAGE_TYPE.TWO_MONTH:
            return "/ 2 months";
        case Purchases.PACKAGE_TYPE.THREE_MONTH:
            return "/ 3 months";
        case Purchases.PACKAGE_TYPE.SIX_MONTH:
            return "/ 6 months";
        case Purchases.PACKAGE_TYPE.ANNUAL:
            return "/ year";
        case Purchases.PACKAGE_TYPE.MONTHLY:
        default:
            return "/ month";
    }
};

export const getPackageRenewalPeriodLabel = (
    subscriptionPackage: PurchasesPackage | null,
    subscriptionProduct: PurchasesStoreProduct | null
) => {
    return getPackageBillingPeriodLabel(subscriptionPackage, subscriptionProduct).replace(
        "/ ",
        "every "
    );
};

export const formatDisplayPrice = (priceString: string | undefined) => {
    return priceString?.replace(/^(?:USD|US\$)[\s\u00A0]*/i, "$") ?? "--";
};

export const isPurchaseCancelledError = (error: unknown) => {
    if (!error || typeof error !== "object") {
        return false;
    }

    if ("userCancelled" in error && error.userCancelled === true) {
        return true;
    }

    if (!("code" in error)) {
        return false;
    }

    return (error as PurchasesError).code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
};
