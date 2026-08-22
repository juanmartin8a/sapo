import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from "@/constants/legal";
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
    isSubscriptionReconciliationAuthMismatch,
    isPendingSubscriptionReconciliation,
    reconcileObservedSubscriptionState,
    type SubscriptionReconciliationStatus,
} from "@/lib/subscription-reconciliation";
import useSubscriptionStatusStore from "@/stores/subscriptionStatusStore";
import { triggerErrorHaptic, triggerLightImpactHaptic, triggerWarningHaptic } from "@/lib/haptics";

const PURCHASE_ERROR_MESSAGE = "Unable to complete the purchase. Please try again.";
const SUBSCRIPTION_SYNC_PENDING_MESSAGE =
    "Your purchase was completed and is still syncing to SAPO. Please check again shortly.";
const SUBSCRIPTION_SESSION_CHANGED_MESSAGE =
    "Your account changed while syncing the subscription. Please sign in again and retry.";

export default function SubscriptionScreen() {
    const { userId } = useAuthState();
    const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);
    const [purchasingUserId, setPurchasingUserId] = useState<string | null>(null);
    const [isSubscriptionLinkedElsewhere, setIsSubscriptionLinkedElsewhere] = useState(false);
    const activePurchaseRef = useRef<symbol | null>(null);
    const [subscriptionPackage, setSubscriptionPackage] = useState<PurchasesPackage | null>(null);
    const [subscriptionProduct, setSubscriptionProduct] = useState<PurchasesStoreProduct | null>(null);
    const subscriptionUserId = useSubscriptionStatusStore((state) => state.userId);
    const storedSubscriptionStatus = useSubscriptionStatusStore((state) => state.status);
    const storedHasActiveSubscription = useSubscriptionStatusStore((state) => state.hasActiveSubscription);
    const hasActiveSubscription = subscriptionUserId === userId && storedHasActiveSubscription === true;
    const isPurchasing = Boolean(userId && purchasingUserId === userId);
    const isActivatingSubscription =
        subscriptionUserId === userId && storedSubscriptionStatus === "activating";
    const canUseRevenueCat = hasRevenueCatConfig();
    const storeAccountLabel = getStoreAccountLabel(Platform.OS);

    const showSubscriptionLinkedElsewhereAlert = useCallback(() => {
        Alert.alert(
            SUBSCRIPTION_LINKED_ELSEWHERE_ALERT_TITLE,
            getSubscriptionLinkedElsewhereMessage(storeAccountLabel)
        );
    }, [storeAccountLabel]);

    const isCurrentSubscriptionUser = useCallback(() => {
        return Boolean(userId && useSubscriptionStatusStore.getState().userId === userId);
    }, [userId]);

    useEffect(() => {
        return () => {
            activePurchaseRef.current = null;
        };
    }, []);

    useEffect(() => {
        let isMounted = true;

        const loadSubscriptionData = async () => {
            if (!isRevenueCatSupportedPlatform || !canUseRevenueCat) {
                if (!isMounted) {
                    return;
                }

                setSubscriptionPackage(null);
                setSubscriptionProduct(null);
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

                        const confirmedAppUserId = await Purchases.getAppUserID();
                        if (confirmedAppUserId === userId) {
                            await reconcileObservedSubscriptionState({
                                userId,
                                observedActive: hasActiveRevenueCatSubscription(customerInfo),
                            });
                        }
                    } catch (error) {
                        if (!isReceiptAlreadyInUseRevenueCatError(error)) {
                            if (__DEV__) {
                                console.warn("Failed to reconcile loaded subscription state", error);
                            }
                        } else {
                            isLinkedElsewhere = true;
                        }
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
    }, [canUseRevenueCat, showSubscriptionLinkedElsewhereAlert, userId]);

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
            return "Loading plan...";
        }

        if (isSubscriptionLinkedElsewhere) {
            return "Sign in to original account";
        }

        if (hasActiveSubscription) {
            return "Subscribed";
        }

        if (isActivatingSubscription) {
            return "Activating subscription...";
        }

        if (!subscriptionPackage && !subscriptionProduct) {
            return "No plans available";
        }

        return `Get ${SUBSCRIPTION_PLAN_DISPLAY_NAMES.POLYGLOT}`;
    }, [
        canUseRevenueCat,
        hasActiveSubscription,
        isActivatingSubscription,
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
            activePurchaseRef.current !== null ||
            isSubscriptionLinkedElsewhere ||
            isActivatingSubscription ||
            hasActiveSubscription
        ) {
            return;
        }

        triggerLightImpactHaptic();
        const purchaseOperation = Symbol("purchase-subscription");
        activePurchaseRef.current = purchaseOperation;
        const isCurrentPurchase = () =>
            activePurchaseRef.current === purchaseOperation && isCurrentSubscriptionUser();

        try {
            setPurchasingUserId(userId);

            await configureRevenueCat(userId);
            if (!isCurrentPurchase()) return;

            const currentAppUserId = await Purchases.getAppUserID();
            if (!isCurrentPurchase()) return;

            if (currentAppUserId !== userId) {
                const loggedInCustomerInfo = (await Purchases.logIn(userId)).customerInfo;
                if (!isCurrentPurchase()) return;
                const hasActiveClientSubscriptionAfterLogin = hasActiveRevenueCatSubscription(loggedInCustomerInfo);
                let loginReconciliationStatus: SubscriptionReconciliationStatus | null = null;
                let loginReconciliationError: unknown = null;

                try {
                    const confirmedAppUserId = await Purchases.getAppUserID();
                    if (!isCurrentPurchase()) return;
                    if (confirmedAppUserId !== userId) {
                        triggerWarningHaptic();
                        Alert.alert(
                            SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE,
                            SUBSCRIPTION_SESSION_CHANGED_MESSAGE
                        );
                        return;
                    }

                    const reconciliationResult = await reconcileObservedSubscriptionState({
                        userId,
                        observedActive: hasActiveClientSubscriptionAfterLogin,
                    });
                    if (!isCurrentPurchase()) return;
                    loginReconciliationStatus = reconciliationResult.status;
                } catch (error) {
                    if (!isCurrentPurchase()) return;
                    loginReconciliationError = error;

                    if (__DEV__) {
                        console.warn("Failed to reconcile subscription state after login", error);
                    }
                }

                if (isSubscriptionReconciliationAuthMismatch(loginReconciliationError)) {
                    setIsSubscriptionLinkedElsewhere(false);
                    triggerWarningHaptic();
                    Alert.alert(
                        SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE,
                        SUBSCRIPTION_SESSION_CHANGED_MESSAGE
                    );
                    return;
                }

                setIsSubscriptionLinkedElsewhere(false);

                if (loginReconciliationStatus && !isCurrentSubscriptionUser()) {
                    triggerWarningHaptic();
                    Alert.alert(
                        SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE,
                        SUBSCRIPTION_SESSION_CHANGED_MESSAGE
                    );
                    return;
                }

                if (loginReconciliationStatus === "active") {
                    Alert.alert(
                        "Subscription active",
                        "Your SAPO subscription is already active on this account."
                    );
                    return;
                }

                if (isPendingSubscriptionReconciliation(loginReconciliationStatus)) {
                    Alert.alert("Subscription pending", SUBSCRIPTION_SYNC_PENDING_MESSAGE);
                    return;
                }

                if (hasActiveClientSubscriptionAfterLogin) {
                    Alert.alert("Subscription pending", SUBSCRIPTION_SYNC_PENDING_MESSAGE);
                    return;
                }

            }

            let customerInfo: CustomerInfo;
            if (!isCurrentPurchase()) return;

            if (subscriptionPackage) {
                customerInfo = (await Purchases.purchasePackage(subscriptionPackage)).customerInfo;
            } else if (subscriptionProduct) {
                customerInfo = (await Purchases.purchaseStoreProduct(subscriptionProduct)).customerInfo;
            } else {
                return;
            }
            if (!isCurrentPurchase()) return;

            const hasActiveClientSubscription = hasActiveRevenueCatSubscription(customerInfo);
            let purchaseReconciliationStatus: SubscriptionReconciliationStatus | null = null;
            let purchaseReconciliationError: unknown = null;

            try {
                const confirmedAppUserId = await Purchases.getAppUserID();
                if (!isCurrentPurchase()) return;
                if (confirmedAppUserId !== userId) {
                    triggerWarningHaptic();
                    Alert.alert(
                        SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE,
                        SUBSCRIPTION_SESSION_CHANGED_MESSAGE
                    );
                    return;
                }

                const reconciliationResult = await reconcileObservedSubscriptionState({
                    userId,
                    observedActive: hasActiveClientSubscription,
                });
                if (!isCurrentPurchase()) return;
                purchaseReconciliationStatus = reconciliationResult.status;
            } catch (error) {
                if (!isCurrentPurchase()) return;
                purchaseReconciliationError = error;

                if (__DEV__) {
                    console.warn("Failed to reconcile subscription state after purchase", error);
                }
            }

            if (isSubscriptionReconciliationAuthMismatch(purchaseReconciliationError)) {
                setIsSubscriptionLinkedElsewhere(false);
                triggerWarningHaptic();
                Alert.alert(
                    SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE,
                    SUBSCRIPTION_SESSION_CHANGED_MESSAGE
                );
                return;
            }

            setIsSubscriptionLinkedElsewhere(false);
            if (purchaseReconciliationStatus && !isCurrentSubscriptionUser()) {
                triggerWarningHaptic();
                Alert.alert(
                    SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE,
                    SUBSCRIPTION_SESSION_CHANGED_MESSAGE
                );
                return;
            }

            if (purchaseReconciliationStatus === "active") {
                Alert.alert("Subscription active", "Your SAPO subscription is now active.");
                return;
            }

            if (
                purchaseReconciliationError ||
                isPendingSubscriptionReconciliation(purchaseReconciliationStatus)
            ) {
                Alert.alert("Purchase pending", SUBSCRIPTION_SYNC_PENDING_MESSAGE);
                return;
            }

            Alert.alert(
                "Purchase pending",
                "The purchase was completed but your subscription could not be verified yet. Please restore purchases from Settings."
            );
        } catch (error) {
            if (!isCurrentPurchase()) return;

            if (isPurchaseCancelledError(error)) {
                return;
            }

            if (isReceiptAlreadyInUseRevenueCatError(error)) {
                if (!isCurrentSubscriptionUser()) {
                    triggerWarningHaptic();
                    Alert.alert(
                        SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE,
                        SUBSCRIPTION_SESSION_CHANGED_MESSAGE
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
            if (activePurchaseRef.current === purchaseOperation) {
                activePurchaseRef.current = null;
                setPurchasingUserId(null);
            }
        }
    }, [
        canUseRevenueCat,
        hasActiveSubscription,
        isActivatingSubscription,
        isLoadingSubscription,
        isPurchasing,
        isSubscriptionLinkedElsewhere,
        isCurrentSubscriptionUser,
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
        isActivatingSubscription ||
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
                isLoadingPlan={isLoadingSubscription}
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
