import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Linking, Platform, StyleSheet } from "react-native";
import Purchases, {
    type CustomerInfo,
    type PurchasesPackage,
    type PurchasesStoreProduct,
} from "react-native-purchases";

import SubscriptionPlanCard from "@/components/settings/subscription/SubscriptionPlanCard";
import {
    formatDisplayPrice,
    getAvailablePackagesFromOfferings,
    getPackageBillingPeriodLabel,
    getPackageRenewalPeriodLabel,
    isPurchaseCancelledError,
} from "@/components/settings/subscription/subscriptionDisplay";
import SettingsScrollView from "@/components/settings/ui/SettingsScrollView";
import { useAuthState } from "@/providers/AuthStateProvider";
import {
    SETTINGS_COLORS,
    SETTINGS_SCREEN_BOTTOM_PADDING,
    SETTINGS_SCREEN_HORIZONTAL_PADDING,
} from "@/constants/settings";
import {
    getStoreAccountLabel,
    getSubscriptionLinkedElsewhereMessage,
    SUBSCRIPTION_LINKED_ELSEWHERE_ALERT_TITLE,
    SUBSCRIPTION_PLAN_DISPLAY_NAMES,
    SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE,
} from "@/constants/subscription";
import {
    configureRevenueCat,
    getRevenueCatSubscriptionProductId,
    hasActiveRevenueCatSubscription,
    hasRevenueCatConfig,
    isReceiptAlreadyInUseRevenueCatError,
    isRevenueCatSupportedPlatform,
} from "@/lib/revenuecat";
import {
    isSubscriptionRefreshAuthMismatch,
    refreshSubscriptionState,
    refreshSubscriptionStateAfterRevenueCatUpdate,
    retrySubscriptionStateAfterRevenueCatUpdateInBackground,
} from "@/lib/subscription-refresh";
import useSubscriptionStatusStore from "@/stores/subscriptionStatusStore";
import { triggerErrorHaptic, triggerLightImpactHaptic, triggerWarningHaptic } from "@/lib/haptics";

const TERMS_OF_USE_URL = "https://sapo.surf/terms-of-use";
const PRIVACY_POLICY_URL = "https://sapo.surf/privacy-policy";

const PURCHASE_ERROR_MESSAGE = "Unable to complete the purchase. Please try again.";

const getSubscriptionSyncPendingMessage = () => {
    return "Your purchase is active. We are still syncing it to SAPO and will keep trying automatically.";
};

const getSubscriptionSessionChangedMessage = () => {
    return "Your account changed while syncing the subscription. Please sign in again and retry.";
};

export default function SubscriptionScreen() {
    const { userId } = useAuthState();
    const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [isSubscriptionLinkedElsewhere, setIsSubscriptionLinkedElsewhere] = useState(false);
    const [subscriptionPackage, setSubscriptionPackage] = useState<PurchasesPackage | null>(null);
    const [subscriptionProduct, setSubscriptionProduct] = useState<PurchasesStoreProduct | null>(null);
    const subscriptionUserId = useSubscriptionStatusStore((state) => state.userId);
    const storedHasActiveSubscription = useSubscriptionStatusStore((state) => state.hasActiveSubscription);
    const setSubscriptionForUser = useSubscriptionStatusStore((state) => state.setForUser);
    const hasActiveSubscription = subscriptionUserId === userId && storedHasActiveSubscription === true;
    const canUseRevenueCat = hasRevenueCatConfig();
    const storeAccountLabel = getStoreAccountLabel(Platform.OS);

    const showSubscriptionLinkedElsewhereAlert = useCallback(() => {
        Alert.alert(
            SUBSCRIPTION_LINKED_ELSEWHERE_ALERT_TITLE,
            getSubscriptionLinkedElsewhereMessage(storeAccountLabel)
        );
    }, [storeAccountLabel]);

    const setCurrentSubscriptionStatus = useCallback((isActive: boolean | null) => {
        return userId ? setSubscriptionForUser(userId, isActive) : false;
    }, [setSubscriptionForUser, userId]);

    useEffect(() => {
        let isMounted = true;

        const loadSubscriptionData = async () => {
            if (!isRevenueCatSupportedPlatform || !canUseRevenueCat) {
                if (!isMounted) {
                    return;
                }

                setSubscriptionPackage(null);
                setSubscriptionProduct(null);
                setCurrentSubscriptionStatus(false);
                setIsSubscriptionLinkedElsewhere(false);
                setIsLoadingSubscription(false);
                return;
            }

            try {
                setIsLoadingSubscription(true);

                await configureRevenueCat(userId);

                const offeringsPromise = Purchases.getOfferings();
                let customerInfo: CustomerInfo | null = null;
                let isLinkedElsewhere = false;

                if (userId) {
                    try {
                        const currentAppUserId = await Purchases.getAppUserID();

                        if (currentAppUserId !== userId) {
                            customerInfo = (await Purchases.logIn(userId)).customerInfo;
                        } else {
                            customerInfo = await Purchases.getCustomerInfo();
                        }
                    } catch (error) {
                        if (!isReceiptAlreadyInUseRevenueCatError(error)) {
                            throw error;
                        }

                        isLinkedElsewhere = true;
                    }
                }

                const offerings = await offeringsPromise;

                const {
                    selectedPackage,
                    allPackages,
                    currentPackages,
                } = getAvailablePackagesFromOfferings(offerings);

                let fallbackProduct: PurchasesStoreProduct | null = null;
                const configuredProductId = getRevenueCatSubscriptionProductId();

                if (!selectedPackage && configuredProductId.length > 0) {
                    const products = await Purchases.getProducts(
                        [configuredProductId],
                        Purchases.PRODUCT_CATEGORY.SUBSCRIPTION
                    );

                    fallbackProduct = products[0] ?? null;
                }

                if (!isMounted) {
                    return;
                }

                setSubscriptionPackage(selectedPackage);
                setSubscriptionProduct(fallbackProduct);
                setCurrentSubscriptionStatus(
                    customerInfo ? hasActiveRevenueCatSubscription(customerInfo) : false
                );
                setIsSubscriptionLinkedElsewhere(isLinkedElsewhere);

                if (isLinkedElsewhere) {
                    showSubscriptionLinkedElsewhereAlert();
                }

                if (__DEV__) {
                    console.log("RevenueCat offerings loaded", {
                        hasCurrentOffering: offerings.current !== null,
                        currentPackagesCount: currentPackages.length,
                        allPackagesCount: allPackages.length,
                        selectedProductId: selectedPackage?.product.identifier ?? fallbackProduct?.identifier ?? null,
                    });
                }
            } catch (error) {
                if (!isMounted) {
                    return;
                }

                setSubscriptionPackage(null);
                setSubscriptionProduct(null);
                setIsSubscriptionLinkedElsewhere(false);

                if (__DEV__) {
                    console.warn("Failed to load subscription data", error);
                }
            } finally {
                if (isMounted) {
                    setIsLoadingSubscription(false);
                }
            }
        };

        void loadSubscriptionData();

        return () => {
            isMounted = false;
        };
    }, [canUseRevenueCat, setCurrentSubscriptionStatus, showSubscriptionLinkedElsewhereAlert, userId]);

    const displayPrice = formatDisplayPrice(
        subscriptionPackage?.product.priceString ?? subscriptionProduct?.priceString
    );
    const billingPeriodLabel = useMemo(() => {
        return getPackageBillingPeriodLabel(subscriptionPackage, subscriptionProduct);
    }, [subscriptionPackage, subscriptionProduct]);
    const renewalPeriodLabel = useMemo(() => {
        return getPackageRenewalPeriodLabel(subscriptionPackage, subscriptionProduct);
    }, [subscriptionPackage, subscriptionProduct]);

    const buttonLabel = useMemo(() => {
        if (!isRevenueCatSupportedPlatform) {
            return "Available on iOS and Android";
        }

        if (!canUseRevenueCat) {
            return "Subscription unavailable";
        }

        if (!userId) {
            return "Sign in to subscribe";
        }

        if (isLoadingSubscription) {
            return "Loading plans...";
        }

        if (isSubscriptionLinkedElsewhere) {
            return "Sign in to original account";
        }

        if (hasActiveSubscription) {
            return "Subscribed";
        }

        if (!subscriptionPackage && !subscriptionProduct) {
            return "No plans available";
        }

        return `Get ${SUBSCRIPTION_PLAN_DISPLAY_NAMES.POLYGLOT}`;
    }, [
        canUseRevenueCat,
        hasActiveSubscription,
        isLoadingSubscription,
        isSubscriptionLinkedElsewhere,
        subscriptionPackage,
        subscriptionProduct,
        userId,
    ]);

    const handleSubscribe = useCallback(async () => {
        if (
            !isRevenueCatSupportedPlatform ||
            !canUseRevenueCat ||
            !userId ||
            (!subscriptionPackage && !subscriptionProduct) ||
            isLoadingSubscription ||
            isPurchasing ||
            isSubscriptionLinkedElsewhere ||
            hasActiveSubscription
        ) {
            return;
        }

        triggerLightImpactHaptic();

        try {
            setIsPurchasing(true);

            await configureRevenueCat(userId);

            const currentAppUserId = await Purchases.getAppUserID();

            if (currentAppUserId !== userId) {
                const loggedInCustomerInfo = (await Purchases.logIn(userId)).customerInfo;
                const hasActiveClientSubscriptionAfterLogin = hasActiveRevenueCatSubscription(loggedInCustomerInfo);
                let hasActiveServerSubscriptionAfterLogin = false;
                let loginRefreshFailed = false;
                let loginRefreshAuthMismatch = false;

                try {
                    const refreshResult = hasActiveClientSubscriptionAfterLogin
                        ? await refreshSubscriptionStateAfterRevenueCatUpdate(userId)
                        : await refreshSubscriptionState({ userId });
                    hasActiveServerSubscriptionAfterLogin = refreshResult?.has_active_subscription === true;
                } catch (error) {
                    loginRefreshFailed = true;
                    loginRefreshAuthMismatch = isSubscriptionRefreshAuthMismatch(error);

                    if (__DEV__) {
                        console.warn("Failed to refresh subscription state after login", error);
                    }
                }

                if (loginRefreshAuthMismatch) {
                    setIsSubscriptionLinkedElsewhere(false);
                    setCurrentSubscriptionStatus(false);
                    triggerWarningHaptic();
                    Alert.alert(
                        SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE,
                        getSubscriptionSessionChangedMessage()
                    );
                    return;
                }

                const hasActiveAfterLogin =
                    hasActiveClientSubscriptionAfterLogin || hasActiveServerSubscriptionAfterLogin;

                setIsSubscriptionLinkedElsewhere(false);
                if (!setCurrentSubscriptionStatus(hasActiveAfterLogin)) {
                    triggerWarningHaptic();
                    Alert.alert(
                        SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE,
                        getSubscriptionSessionChangedMessage()
                    );
                    return;
                }

                if (hasActiveAfterLogin) {
                    if (loginRefreshFailed) {
                        retrySubscriptionStateAfterRevenueCatUpdateInBackground(userId);
                        Alert.alert("Subscription active", getSubscriptionSyncPendingMessage());
                    } else {
                        Alert.alert(
                            "Subscription active",
                            "Your SAPO subscription is already active on this account."
                        );
                    }

                    return;
                }
            }

            let customerInfo: CustomerInfo;

            if (subscriptionPackage) {
                customerInfo = (await Purchases.purchasePackage(subscriptionPackage)).customerInfo;
            } else if (subscriptionProduct) {
                customerInfo = (await Purchases.purchaseStoreProduct(subscriptionProduct)).customerInfo;
            } else {
                return;
            }

            const hasActiveClientSubscription = hasActiveRevenueCatSubscription(customerInfo);
            let hasActiveServerSubscription = false;
            let purchaseRefreshFailed = false;
            let purchaseRefreshAuthMismatch = false;

            try {
                const refreshResult = hasActiveClientSubscription
                    ? await refreshSubscriptionStateAfterRevenueCatUpdate(userId)
                    : await refreshSubscriptionState({ userId });
                hasActiveServerSubscription = refreshResult?.has_active_subscription === true;
            } catch (error) {
                purchaseRefreshFailed = true;
                purchaseRefreshAuthMismatch = isSubscriptionRefreshAuthMismatch(error);

                if (__DEV__) {
                    console.warn("Failed to refresh subscription state after purchase", error);
                }
            }

            if (purchaseRefreshAuthMismatch) {
                setIsSubscriptionLinkedElsewhere(false);
                setCurrentSubscriptionStatus(false);
                triggerWarningHaptic();
                Alert.alert(
                    SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE,
                    getSubscriptionSessionChangedMessage()
                );
                return;
            }

            const isActive = hasActiveClientSubscription || hasActiveServerSubscription;

            setIsSubscriptionLinkedElsewhere(false);
            if (!setCurrentSubscriptionStatus(isActive)) {
                triggerWarningHaptic();
                Alert.alert(
                    SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE,
                    getSubscriptionSessionChangedMessage()
                );
                return;
            }

            if (isActive) {
                if (purchaseRefreshFailed) {
                    retrySubscriptionStateAfterRevenueCatUpdateInBackground(userId);
                    Alert.alert("Subscription active", getSubscriptionSyncPendingMessage());
                } else {
                    Alert.alert("Subscription active", "Your SAPO subscription is now active.");
                }

                return;
            }

            Alert.alert(
                "Purchase pending",
                "The purchase was completed but your subscription could not be verified yet. Please restore purchases from Settings."
            );
        } catch (error) {
            if (isPurchaseCancelledError(error)) {
                return;
            }

            if (isReceiptAlreadyInUseRevenueCatError(error)) {
                if (!setCurrentSubscriptionStatus(false)) {
                    triggerWarningHaptic();
                    Alert.alert(
                        SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE,
                        getSubscriptionSessionChangedMessage()
                    );
                    return;
                }

                setIsSubscriptionLinkedElsewhere(true);
                triggerWarningHaptic();
                showSubscriptionLinkedElsewhereAlert();
                return;
            }

            if (__DEV__) {
                console.warn("Purchase failed", error);
            }

            triggerErrorHaptic();
            Alert.alert("Purchase failed", PURCHASE_ERROR_MESSAGE);
        } finally {
            setIsPurchasing(false);
        }
    }, [
        canUseRevenueCat,
        hasActiveSubscription,
        isLoadingSubscription,
        isPurchasing,
        isSubscriptionLinkedElsewhere,
        setCurrentSubscriptionStatus,
        showSubscriptionLinkedElsewhereAlert,
        subscriptionPackage,
        subscriptionProduct,
        userId,
    ]);

    const isSubscribeDisabled =
        !isRevenueCatSupportedPlatform ||
        !canUseRevenueCat ||
        !userId ||
        (!subscriptionPackage && !subscriptionProduct) ||
        isLoadingSubscription ||
        isPurchasing ||
        isSubscriptionLinkedElsewhere ||
        hasActiveSubscription;

    const handleOpenTermsOfUse = useCallback(() => {
        void Linking.openURL(TERMS_OF_USE_URL);
    }, []);

    const handleOpenPrivacyPolicy = useCallback(() => {
        void Linking.openURL(PRIVACY_POLICY_URL);
    }, []);

    return (
        <SettingsScrollView
            style={styles.container}
            contentContainerStyle={styles.contentContainer}
        >
            <SubscriptionPlanCard
                displayPrice={displayPrice}
                billingPeriodLabel={billingPeriodLabel}
                renewalPeriodLabel={renewalPeriodLabel}
                storeAccountLabel={storeAccountLabel}
                buttonLabel={buttonLabel}
                isPurchasing={isPurchasing}
                isSubscribeDisabled={isSubscribeDisabled}
                onSubscribe={() => {
                    void handleSubscribe();
                }}
                onOpenTermsOfUse={handleOpenTermsOfUse}
                onOpenPrivacyPolicy={handleOpenPrivacyPolicy}
            />
        </SettingsScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: SETTINGS_COLORS.screenBackground,
    },
    contentContainer: {
        paddingHorizontal: SETTINGS_SCREEN_HORIZONTAL_PADDING,
        paddingBottom: SETTINGS_SCREEN_BOTTOM_PADDING,
    },
});
