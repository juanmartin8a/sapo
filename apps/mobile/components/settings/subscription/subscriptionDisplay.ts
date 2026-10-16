import Purchases, {
    type PurchasesError,
    type PurchasesPackage,
    type PurchasesStoreProduct,
} from "react-native-purchases";

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
