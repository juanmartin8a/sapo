import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, Text } from "react-native";
import Purchases from "react-native-purchases";

import SubscriptionPlanCard from "@/components/settings/subscription/SubscriptionPlanCard";
import {
    formatDisplayPrice,
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
    hasActiveRevenueCatSubscription,
    hasRevenueCatConfig,
    isReceiptAlreadyInUseRevenueCatError,
    isRevenueCatSupportedPlatform,
    runRevenueCatOperationForUser,
} from "@/lib/revenuecat";
import {
    isSubscriptionReconciliationAuthMismatch,
    isPendingSubscriptionReconciliation,
    reconcileObservedSubscriptionState,
    type SubscriptionReconciliationStatus,
} from "@/lib/subscription-reconciliation";
import useRevenueCatOfferingStore from "@/stores/revenueCatOfferingStore";
import useSubscriptionStatusStore from "@/stores/subscriptionStatusStore";
import { triggerErrorHaptic, triggerLightImpactHaptic, triggerWarningHaptic } from "@/lib/haptics";
import useSubscriptionAccess from "@/hooks/useSubscriptionAccess";

const PURCHASE_ERROR_MESSAGE = "Unable to complete the purchase. Please try again.";
const SUBSCRIPTION_SYNC_PENDING_MESSAGE =
    "Your purchase was completed and is still syncing to SAPO. Please check again shortly.";
const SUBSCRIPTION_SESSION_CHANGED_MESSAGE =
    "Your account changed while syncing the subscription. Please sign in again and retry.";

export default function SubscriptionScreen() {
    const { status: authStatus, userId } = useAuthState();
    const {
        hasActiveSubscription: effectiveSubscriptionStatus,
        isActivating: isActivatingSubscription,
        isPending: isSubscriptionUnresolved,
    } = useSubscriptionAccess();
    const [purchasingUserId, setPurchasingUserId] = useState<string | null>(null);
    const activePurchaseRef = useRef<symbol | null>(null);
    const currentUserIdRef = useRef(userId);
    const offeringUserId = useRevenueCatOfferingStore((state) => state.userId);
    const providerLinkedElsewhereUserId = useRevenueCatOfferingStore(
        (state) => state.linkedElsewhereUserId
    );
    const setLinkedElsewhereUser = useRevenueCatOfferingStore(
        (state) => state.setLinkedElsewhereUser
    );
    const offeringStatus = useRevenueCatOfferingStore((state) => state.status);
    const storedSubscriptionPackage = useRevenueCatOfferingStore((state) => state.subscriptionPackage);
    const storedSubscriptionProduct = useRevenueCatOfferingStore((state) => state.subscriptionProduct);
    const loadRevenueCatOffering = useRevenueCatOfferingStore((state) => state.loadForUser);
    const requestRevenueCatIdentitySync = useRevenueCatOfferingStore(
        (state) => state.requestIdentitySync
    );
    const subscriptionPackage = offeringUserId === userId ? storedSubscriptionPackage : null;
    const subscriptionProduct = offeringUserId === userId ? storedSubscriptionProduct : null;
    const hasActiveSubscription = effectiveSubscriptionStatus === true;
    const isPurchasing = Boolean(userId && purchasingUserId === userId);
    const isSubscriptionLinkedElsewhere = Boolean(
        userId && providerLinkedElsewhereUserId === userId
    );
    const canUseRevenueCat = hasRevenueCatConfig();
    const storeAccountLabel = getStoreAccountLabel(Platform.OS);
    const isOfferingForCurrentUser = offeringUserId === userId;
    const hasLoadedPlan = Boolean(subscriptionPackage || subscriptionProduct);
    const isWaitingForPlan =
        isRevenueCatSupportedPlatform &&
        canUseRevenueCat &&
        Boolean(userId) &&
        !hasLoadedPlan &&
        !isSubscriptionLinkedElsewhere &&
        (!isOfferingForCurrentUser || (offeringStatus !== "ready" && offeringStatus !== "error"));
    const hasPlanLoadError =
        Boolean(userId) &&
        !isSubscriptionLinkedElsewhere &&
        isOfferingForCurrentUser &&
        !hasLoadedPlan &&
        offeringStatus === "error";

    const showSubscriptionLinkedElsewhereAlert = useCallback(() => {
        Alert.alert(
            SUBSCRIPTION_LINKED_ELSEWHERE_ALERT_TITLE,
            getSubscriptionLinkedElsewhereMessage(storeAccountLabel)
        );
    }, [storeAccountLabel]);

    const isCurrentSubscriptionUser = useCallback(() => {
        return Boolean(
            userId &&
            currentUserIdRef.current === userId &&
            useSubscriptionStatusStore.getState().userId === userId
        );
    }, [userId]);

    useEffect(() => {
        currentUserIdRef.current = userId;
    }, [userId]);

    useEffect(() => {
        return () => {
            activePurchaseRef.current = null;
        };
    }, []);

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

        if (authStatus === "signed_out") {
            return "Sign in to subscribe";
        }

        if (isSubscriptionLinkedElsewhere) {
            return "Sign in to original account";
        }

        if (isSubscriptionUnresolved) {
            return "Checking subscription...";
        }

        if (hasActiveSubscription) {
            return "Subscribed";
        }

        if (!userId) {
            return "Checking subscription...";
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
        authStatus,
        hasActiveSubscription,
        isActivatingSubscription,
        isSubscriptionLinkedElsewhere,
        isSubscriptionUnresolved,
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
            isPurchasing ||
            activePurchaseRef.current !== null ||
            isSubscriptionLinkedElsewhere ||
            isSubscriptionUnresolved ||
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

            const currentCustomerInfo = await runRevenueCatOperationForUser(
                userId,
                (customerInfo) => customerInfo,
                isCurrentPurchase
            );
            if (!currentCustomerInfo || !isCurrentPurchase()) return;

            const observedActiveBeforePurchase =
                hasActiveRevenueCatSubscription(currentCustomerInfo);
            let prePurchaseStatus: SubscriptionReconciliationStatus | null = null;
            let prePurchaseError: unknown = null;

            try {
                const reconciliationResult = await reconcileObservedSubscriptionState({
                    userId,
                    observedActive: observedActiveBeforePurchase,
                });
                if (!isCurrentPurchase()) return;
                prePurchaseStatus = reconciliationResult.status;
            } catch (error) {
                if (!isCurrentPurchase()) return;
                prePurchaseError = error;

                if (__DEV__) {
                    console.warn("Failed to reconcile subscription before purchase", error);
                }
            }

            if (isSubscriptionReconciliationAuthMismatch(prePurchaseError)) {
                setLinkedElsewhereUser(null);
                triggerWarningHaptic();
                Alert.alert(
                    SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE,
                    SUBSCRIPTION_SESSION_CHANGED_MESSAGE
                );
                return;
            }

            setLinkedElsewhereUser(null);

            if (prePurchaseStatus === "active") {
                Alert.alert(
                    "Subscription active",
                    "Your SAPO subscription is already active on this account."
                );
                return;
            }

            if (isPendingSubscriptionReconciliation(prePurchaseStatus)) {
                Alert.alert("Subscription pending", SUBSCRIPTION_SYNC_PENDING_MESSAGE);
                return;
            }

            if (observedActiveBeforePurchase) {
                Alert.alert("Subscription pending", SUBSCRIPTION_SYNC_PENDING_MESSAGE);
                return;
            }

            const customerInfo = await runRevenueCatOperationForUser(
                userId,
                async () => {
                    if (subscriptionPackage) {
                        return (await Purchases.purchasePackage(subscriptionPackage)).customerInfo;
                    }

                    if (subscriptionProduct) {
                        return (await Purchases.purchaseStoreProduct(subscriptionProduct)).customerInfo;
                    }

                    return null;
                },
                isCurrentPurchase
            );
            if (!customerInfo || !isCurrentPurchase()) return;

            const hasActiveClientSubscription = hasActiveRevenueCatSubscription(customerInfo);
            let purchaseReconciliationStatus: SubscriptionReconciliationStatus | null = null;
            let purchaseReconciliationError: unknown = null;

            try {
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
                setLinkedElsewhereUser(null);
                triggerWarningHaptic();
                Alert.alert(
                    SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE,
                    SUBSCRIPTION_SESSION_CHANGED_MESSAGE
                );
                return;
            }

            setLinkedElsewhereUser(null);
            if (purchaseReconciliationStatus && !isCurrentSubscriptionUser()) {
                triggerWarningHaptic();
                Alert.alert(
                    SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE,
                    SUBSCRIPTION_SESSION_CHANGED_MESSAGE
                );
                return;
            }

            requestRevenueCatIdentitySync();

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

                setLinkedElsewhereUser(userId);
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
        isPurchasing,
        isSubscriptionLinkedElsewhere,
        isSubscriptionUnresolved,
        isCurrentSubscriptionUser,
        requestRevenueCatIdentitySync,
        showSubscriptionLinkedElsewhereAlert,
        setLinkedElsewhereUser,
        subscriptionPackage,
        subscriptionProduct,
        userId,
    ]);

    const isSubscribeDisabled =
        !isRevenueCatSupportedPlatform ||
        !canUseRevenueCat ||
        !userId ||
        (!subscriptionPackage && !subscriptionProduct) ||
        isPurchasing ||
        isSubscriptionLinkedElsewhere ||
        isSubscriptionUnresolved ||
        isActivatingSubscription ||
        hasActiveSubscription;

    const handleOpenTermsOfUse = useCallback(() => {
        void Linking.openURL(TERMS_OF_USE_URL);
    }, []);

    const handleOpenPrivacyPolicy = useCallback(() => {
        void Linking.openURL(PRIVACY_POLICY_URL);
    }, []);

    const handleRetryPlanLoad = useCallback(() => {
        void loadRevenueCatOffering(userId);
    }, [loadRevenueCatOffering, userId]);

    if (isWaitingForPlan) {
        return (
            <SettingsScrollView
                style={styles.container}
                contentContainerStyle={[styles.contentContainer, styles.loadStateContent]}
            >
                <ActivityIndicator color={SETTINGS_COLORS.primaryText} size="small" />
            </SettingsScrollView>
        );
    }

    if (hasPlanLoadError) {
        return (
            <SettingsScrollView
                style={styles.container}
                contentContainerStyle={[styles.contentContainer, styles.loadStateContent]}
            >
                <Text style={styles.loadErrorText}>Unable to load subscription options.</Text>
                <Pressable
                    onPress={handleRetryPlanLoad}
                    style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
                >
                    <Text style={styles.retryButtonText}>Try again</Text>
                </Pressable>
            </SettingsScrollView>
        );
    }

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
    loadStateContent: {
        alignItems: "center",
        gap: 14,
    },
    loadErrorText: {
        color: SETTINGS_COLORS.mutedText,
        fontSize: 14,
        lineHeight: 20,
        textAlign: "center",
    },
    retryButton: {
        minHeight: 40,
        justifyContent: "center",
        borderRadius: 10,
        paddingHorizontal: 18,
        backgroundColor: SETTINGS_COLORS.primaryText,
    },
    retryButtonPressed: {
        opacity: 0.78,
    },
    retryButtonText: {
        color: SETTINGS_COLORS.surface,
        fontSize: 14,
        lineHeight: 20,
        fontWeight: "600",
    },
});
