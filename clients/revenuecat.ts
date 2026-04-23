import { Linking, Platform } from "react-native";
import Purchases, { type CustomerInfo, type PurchasesError } from "react-native-purchases";

const REVENUECAT_ANONYMOUS_ID_PREFIX = "$RCAnonymousID:";

const iosRevenueCatApiKey = process.env.EXPO_PUBLIC_REVENUE_CAT_APPLE_API_KEY ?? "";
const androidRevenueCatApiKey = process.env.EXPO_PUBLIC_REVENUE_CAT_GOOGLE_API_KEY ?? "";
const iosSubscriptionProductId = process.env.EXPO_PUBLIC_IOS_SUBSCRIPTION_PRODUCT_ID ?? "";
const androidSubscriptionProductId = process.env.EXPO_PUBLIC_ANDROID_SUBSCRIPTION_PRODUCT_ID ?? "";

export const revenueCatEntitlementId =
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

    return Object.keys(customerInfo.entitlements.active).length > 0;
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

export const configureRevenueCat = async (appUserId: string): Promise<boolean> => {
    if (!hasRevenueCatConfig()) {
        return false;
    }

    const normalizedAppUserId = appUserId.trim();

    if (normalizedAppUserId.length === 0) {
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
                appUserID: normalizedAppUserId,
            });
        }

        return true;
    })().catch((error) => {
        configurePromise = null;
        throw error;
    });

    return configurePromise;
};

export const isAnonymousRevenueCatUser = (appUserId: string) => {
    return appUserId.startsWith(REVENUECAT_ANONYMOUS_ID_PREFIX);
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

export const getRevenueCatManagementUrl = async (appUserId: string) => {
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
