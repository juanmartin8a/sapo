import { Linking, Platform } from "react-native";
import Purchases, {
    type CustomerInfo,
    type PurchasesError,
    type PurchasesPackage,
    type PurchasesStoreProduct,
} from "react-native-purchases";

const iosRevenueCatApiKey = process.env.EXPO_PUBLIC_REVENUE_CAT_APPLE_API_KEY ?? "";
const androidRevenueCatApiKey = process.env.EXPO_PUBLIC_REVENUE_CAT_GOOGLE_API_KEY ?? "";
const iosSubscriptionProductId = process.env.EXPO_PUBLIC_IOS_SUBSCRIPTION_PRODUCT_ID ?? "";
const androidSubscriptionProductId = process.env.EXPO_PUBLIC_ANDR_SUBSCRIPTION_PRODUCT_ID ?? "";

const revenueCatEntitlementId =
    process.env.EXPO_PUBLIC_REVENUE_CAT_ENTITLEMENT_ID ?? "";

const getRevenueCatApiKey = () => {
    if (Platform.OS === "ios") {
        return iosRevenueCatApiKey;
    }

    if (Platform.OS === "android") {
        return androidRevenueCatApiKey;
    }

    return "";
};

export const getRevenueCatSubscriptionProductId = () => {
    if (Platform.OS === "ios") {
        return iosSubscriptionProductId;
    }

    if (Platform.OS === "android") {
        return androidSubscriptionProductId;
    }

    return "";
};

export const isRevenueCatSupportedPlatform =
    Platform.OS === "ios" || Platform.OS === "android";

export const hasRevenueCatConfig = () => {
    return isRevenueCatSupportedPlatform && getRevenueCatApiKey().length > 0;
};

export const hasActiveRevenueCatSubscription = (customerInfo: CustomerInfo) => {
    if (revenueCatEntitlementId.length > 0) {
        return typeof customerInfo.entitlements.active[revenueCatEntitlementId] !== "undefined";
    }

    const configuredProductId = getRevenueCatSubscriptionProductId();

    if (configuredProductId.length > 0) {
        return customerInfo.activeSubscriptions.includes(configuredProductId);
    }

    return false;
};

export const isReceiptAlreadyInUseRevenueCatError = (error: unknown) => {
    if (!error || typeof error !== "object") {
        return false;
    }

    if (!("code" in error)) {
        return false;
    }

    return (
        (error as PurchasesError).code ===
        Purchases.PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR
    );
};

let configurePromise: Promise<boolean> | null = null;

export const configureRevenueCat = async (appUserId: string | null): Promise<boolean> => {
    if (!hasRevenueCatConfig()) {
        return false;
    }

    const normalizedAppUserId = appUserId === null ? null : appUserId.trim();

    if (normalizedAppUserId === "") {
        return false;
    }

    if (configurePromise) {
        return configurePromise;
    }

    configurePromise = (async () => {
        if (__DEV__) {
            await Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
        }

        const isConfigured = await Purchases.isConfigured();

        if (!isConfigured) {
            Purchases.configure({
                apiKey: getRevenueCatApiKey(),
                ...(normalizedAppUserId ? { appUserID: normalizedAppUserId } : {}),
            });
        }

        return true;
    })().catch((error) => {
        configurePromise = null;
        throw error;
    });

    return configurePromise;
};

export const getRevenueCatCustomerInfo = async (appUserId: string): Promise<CustomerInfo | null> => {
    const isConfigured = await configureRevenueCat(appUserId);

    if (!isConfigured) {
        return null;
    }

    const currentAppUserId = await Purchases.getAppUserID();

    if (currentAppUserId !== appUserId) {
        return (await Purchases.logIn(appUserId)).customerInfo;
    }

    return Purchases.getCustomerInfo();
};

export interface RevenueCatSubscriptionOffering {
    subscriptionPackage: PurchasesPackage | null;
    subscriptionProduct: PurchasesStoreProduct | null;
}

export const getRevenueCatSubscriptionOffering = async (): Promise<RevenueCatSubscriptionOffering> => {
    const offerings = await Purchases.getOfferings();
    const currentPackages = offerings.current?.availablePackages ?? [];
    const allPackages = Object.values(offerings.all).flatMap(
        (offering) => offering.availablePackages
    );
    const configuredProductId = getRevenueCatSubscriptionProductId();
    const configuredPackage = configuredProductId.length > 0
        ? allPackages.find((item) => item.product.identifier === configuredProductId)
        : undefined;
    const availablePackages = currentPackages.length > 0 ? currentPackages : allPackages;
    const monthlyPackage = availablePackages.find(
        (item) => item.packageType === Purchases.PACKAGE_TYPE.MONTHLY
    );
    const subscriptionPackage = configuredPackage ?? monthlyPackage ?? availablePackages[0] ?? null;

    let subscriptionProduct: PurchasesStoreProduct | null = null;
    if (!subscriptionPackage && configuredProductId.length > 0) {
        const products = await Purchases.getProducts(
            [configuredProductId],
            Purchases.PRODUCT_CATEGORY.SUBSCRIPTION
        );
        subscriptionProduct = products[0] ?? null;
    }

    if (__DEV__) {
        console.log("RevenueCat offerings loaded", {
            hasCurrentOffering: offerings.current !== null,
            currentPackagesCount: currentPackages.length,
            allPackagesCount: allPackages.length,
            selectedProductId: subscriptionPackage?.product.identifier ?? subscriptionProduct?.identifier ?? null,
        });
    }

    return { subscriptionPackage, subscriptionProduct };
};

export const logOutRevenueCatIdentity = async (expectedAppUserId?: string | null) => {
    if (!hasRevenueCatConfig()) {
        return false;
    }

    if (configurePromise) {
        try {
            await configurePromise;
        } catch {
            // Fall through to the configured-state check below.
        }
    }

    const isConfigured = await Purchases.isConfigured();

    if (!isConfigured) {
        return false;
    }

    const currentAppUserId = await Purchases.getAppUserID();

    if (expectedAppUserId && currentAppUserId !== expectedAppUserId) {
        return false;
    }

    if (!expectedAppUserId) {
        return false;
    }

    await Purchases.logOut();
    return true;
};

const getRevenueCatManagementUrl = async (appUserId: string) => {
    const customerInfo = await getRevenueCatCustomerInfo(appUserId);
    return customerInfo?.managementURL ?? null;
};

export const openRevenueCatManagementUrl = async (appUserId: string) => {
    const managementUrl = await getRevenueCatManagementUrl(appUserId);

    if (!managementUrl) {
        return false;
    }

    await Linking.openURL(managementUrl);
    return true;
};
