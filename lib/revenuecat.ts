import { Linking, Platform } from "react-native";
import Purchases, {
    type CustomerInfo,
    type PurchasesEntitlementInfo,
    type PurchasesError,
    type PurchasesPackage,
    type PurchasesStoreProduct,
    type PurchasesSubscriptionInfo,
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

export const hasCurrentRevenueCatEntitlementAccess = (
    entitlement: PurchasesEntitlementInfo | undefined,
    nowMs = Date.now()
) =>
    entitlement?.isActive === true &&
    (entitlement.expirationDateMillis === null || entitlement.expirationDateMillis > nowMs);

export const hasCurrentRevenueCatProductAccess = (
    subscription: PurchasesSubscriptionInfo | undefined,
    nowMs = Date.now()
) => {
    if (subscription?.isActive !== true) {
        return false;
    }

    const accessExpirationDates = [subscription.expiresDate, subscription.gracePeriodExpiresDate]
        .filter((value): value is string => typeof value === "string")
        .map((value) => Date.parse(value))
        .filter(Number.isFinite);

    return accessExpirationDates.length > 0 && nowMs < Math.max(...accessExpirationDates);
};

export const hasActiveRevenueCatSubscription = (customerInfo: CustomerInfo) => {
    if (revenueCatEntitlementId.length > 0) {
        return hasCurrentRevenueCatEntitlementAccess(
            customerInfo.entitlements.active[revenueCatEntitlementId]
        );
    }

    const configuredProductId = getRevenueCatSubscriptionProductId();

    if (configuredProductId.length > 0) {
        return hasCurrentRevenueCatProductAccess(
            customerInfo.subscriptionsByProductIdentifier[configuredProductId]
        );
    }

    return false;
};

export const getRevenueCatAccessExpirationAtMs = (customerInfo: CustomerInfo) => {
    if (revenueCatEntitlementId.length > 0) {
        const entitlement = customerInfo.entitlements.active[revenueCatEntitlementId];
        return hasCurrentRevenueCatEntitlementAccess(entitlement)
            ? entitlement.expirationDateMillis
            : null;
    }

    const configuredProductId = getRevenueCatSubscriptionProductId();
    const subscription = configuredProductId.length > 0
        ? customerInfo.subscriptionsByProductIdentifier[configuredProductId]
        : undefined;

    if (!hasCurrentRevenueCatProductAccess(subscription)) {
        return null;
    }

    const accessExpirationDates = [subscription?.expiresDate, subscription?.gracePeriodExpiresDate]
        .filter((value): value is string => typeof value === "string")
        .map((value) => Date.parse(value))
        .filter(Number.isFinite);

    return accessExpirationDates.length > 0 ? Math.max(...accessExpirationDates) : null;
};

export const getRevenueCatSubscriptionFingerprint = (customerInfo: CustomerInfo) => {
    const isActive = hasActiveRevenueCatSubscription(customerInfo);
    const expirationAtMs = isActive ? getRevenueCatAccessExpirationAtMs(customerInfo) : null;
    return `${isActive ? "active" : "inactive"}:${expirationAtMs ?? "none"}`;
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
let desiredRevenueCatAppUserId: string | null = null;
let revenueCatIdentityQueue: Promise<void> = Promise.resolve();

export const setDesiredRevenueCatAppUserId = (appUserId: string | null) => {
    desiredRevenueCatAppUserId = appUserId;
};

const serializeRevenueCatIdentityOperation = <Result,>(operation: () => Promise<Result>) => {
    const result = revenueCatIdentityQueue.then(operation, operation);
    revenueCatIdentityQueue = result.then(
        () => undefined,
        () => undefined
    );
    return result;
};

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

export const runRevenueCatOperationForUser = <Result,>(
    appUserId: string,
    operation: (customerInfo: CustomerInfo) => Promise<Result> | Result,
    shouldContinue: () => boolean = () => true
): Promise<Result | null> => serializeRevenueCatIdentityOperation(async () => {
    if (desiredRevenueCatAppUserId !== appUserId || !shouldContinue()) {
        return null;
    }

    const isConfigured = await configureRevenueCat(appUserId);

    if (
        !isConfigured ||
        desiredRevenueCatAppUserId !== appUserId ||
        !shouldContinue()
    ) {
        return null;
    }

    const currentAppUserId = await Purchases.getAppUserID();
    if (desiredRevenueCatAppUserId !== appUserId || !shouldContinue()) {
        return null;
    }

    const customerInfo = currentAppUserId === appUserId
        ? await Purchases.getCustomerInfo()
        : (await Purchases.logIn(appUserId)).customerInfo;
    const confirmedAppUserId = await Purchases.getAppUserID();

    if (
        desiredRevenueCatAppUserId !== appUserId ||
        confirmedAppUserId !== appUserId ||
        !shouldContinue()
    ) {
        return null;
    }

    const result = await operation(customerInfo);
    const finalAppUserId = await Purchases.getAppUserID();

    if (
        desiredRevenueCatAppUserId !== appUserId ||
        finalAppUserId !== appUserId ||
        !shouldContinue()
    ) {
        return null;
    }

    return result;
});

export const getRevenueCatCustomerInfo = (
    appUserId: string,
    shouldContinue?: () => boolean
): Promise<CustomerInfo | null> => runRevenueCatOperationForUser(
    appUserId,
    (customerInfo) => customerInfo,
    shouldContinue
);

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

export const logOutRevenueCatIdentity = (
    expectedAppUserId?: string | null
): Promise<boolean> => serializeRevenueCatIdentityOperation(async () => {
    if (!hasRevenueCatConfig()) {
        return false;
    }

    await configureRevenueCat(null);

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

    if (!expectedAppUserId && (await Purchases.isAnonymous())) {
        return true;
    }

    await Purchases.logOut();
    return true;
});

const getRevenueCatManagementUrl = async (
    appUserId: string,
    shouldContinue: () => boolean
) => {
    const customerInfo = await getRevenueCatCustomerInfo(appUserId, shouldContinue);
    return customerInfo?.managementURL ?? null;
};

export const openRevenueCatManagementUrl = async (
    appUserId: string,
    shouldOpen: () => boolean = () => true
) => {
    const managementUrl = await getRevenueCatManagementUrl(appUserId, shouldOpen);

    if (!managementUrl || !shouldOpen()) {
        return false;
    }

    await Linking.openURL(managementUrl);
    return true;
};
