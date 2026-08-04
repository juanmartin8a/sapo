import { useCallback, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { Alert, Platform } from "react-native";
import Purchases from "react-native-purchases";

import { APP_ROUTES } from "@/constants/routes";
import {
    getStoreAccountLabel,
    getSubscriptionLinkedElsewhereMessage,
    SUBSCRIPTION_LINKED_ELSEWHERE_ALERT_TITLE,
    SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE,
} from "@/constants/subscription";
import { authClient } from "@/lib/auth-client";
import {
    triggerErrorHaptic,
    triggerLightImpactHaptic,
    triggerStrongImpactHaptic,
    triggerWarningHaptic,
} from "@/lib/haptics";
import {
    configureRevenueCat,
    hasActiveRevenueCatSubscription,
    hasRevenueCatConfig,
    isReceiptAlreadyInUseRevenueCatError,
    isRevenueCatSupportedPlatform,
    openRevenueCatManagementUrl,
} from "@/lib/revenuecat";
import {
    isSubscriptionRefreshAuthMismatch,
    refreshSubscriptionState,
    refreshSubscriptionStateAfterRevenueCatUpdate,
    retrySubscriptionStateAfterRevenueCatUpdateInBackground,
} from "@/lib/subscription-refresh";
import { useAuthState } from "@/providers/AuthStateProvider";
import useSubscriptionStatusStore from "@/stores/subscriptionStatusStore";

const RESTORE_PURCHASES_ERROR_MESSAGE = "Unable to restore purchases. Please try again.";
const MANAGE_SUBSCRIPTION_ERROR_MESSAGE = "Unable to open subscription settings. Please try again.";
const RESTORE_SESSION_CHANGED_MESSAGE =
    "Your account changed while syncing purchases. Please sign in again and retry.";

export default function useSettingsActions() {
    const router = useRouter();
    const { status: authStatus, userId } = useAuthState();
    const setSubscriptionForUser = useSubscriptionStatusStore((state) => state.setForUser);
    const [isSigningOut, setIsSigningOut] = useState(false);
    const [isRestoringPurchases, setIsRestoringPurchases] = useState(false);
    const [isManagingSubscription, setIsManagingSubscription] = useState(false);
    const activeRestoreRef = useRef<symbol | null>(null);
    const isPending = authStatus === "checking";
    const isAuthenticatedUser = authStatus === "authenticated";
    const canUseRevenueCat = hasRevenueCatConfig();
    const storeAccountLabel = getStoreAccountLabel(Platform.OS);
    const shouldShowAuthenticatedActions = isAuthenticatedUser || isSigningOut;
    const isRestorePurchasesDisabled =
        isPending ||
        isSigningOut ||
        isRestoringPurchases ||
        !userId ||
        !isRevenueCatSupportedPlatform ||
        !canUseRevenueCat;
    const isManageSubscriptionDisabled =
        isPending ||
        isSigningOut ||
        isManagingSubscription ||
        !userId ||
        !isRevenueCatSupportedPlatform ||
        !canUseRevenueCat;

    const handleOpenSubscription = useCallback(() => {
        router.push(APP_ROUTES.SUBSCRIPTION);
    }, [router]);

    const handleOpenDataControls = useCallback(() => {
        router.push(APP_ROUTES.DATA_CONTROLS);
    }, [router]);

    const handleOpenLocalModels = useCallback(() => {
        router.push(APP_ROUTES.LOCAL_MODELS);
    }, [router]);

    const handleSignIn = useCallback(() => {
        router.push(APP_ROUTES.AUTH);
    }, [router]);

    const handleRestorePurchases = useCallback(async () => {
        if (
            isPending ||
            isSigningOut ||
            isRestoringPurchases ||
            activeRestoreRef.current !== null ||
            !userId ||
            !isRevenueCatSupportedPlatform ||
            !canUseRevenueCat
        ) {
            return;
        }

        triggerLightImpactHaptic();
        const restoreOperation = Symbol("restore-purchases");
        activeRestoreRef.current = restoreOperation;

        try {
            setIsRestoringPurchases(true);
            await configureRevenueCat(userId);
            if (activeRestoreRef.current !== restoreOperation) return;

            const currentAppUserId = await Purchases.getAppUserID();
            if (activeRestoreRef.current !== restoreOperation) return;

            if (currentAppUserId !== userId) {
                await Purchases.logIn(userId);
                if (activeRestoreRef.current !== restoreOperation) return;
            }

            const customerInfo = await Purchases.restorePurchases();
            if (activeRestoreRef.current !== restoreOperation) return;

            const hasActiveClientSubscription = hasActiveRevenueCatSubscription(customerInfo);
            let hasActiveServerSubscription = false;
            let refreshFailed = false;
            let refreshAuthMismatch = false;

            try {
                const refreshResult = hasActiveClientSubscription
                    ? await refreshSubscriptionStateAfterRevenueCatUpdate(userId)
                    : await refreshSubscriptionState({ userId });
                if (activeRestoreRef.current !== restoreOperation) return;

                hasActiveServerSubscription = refreshResult?.has_active_subscription === true;
            } catch (error) {
                if (activeRestoreRef.current !== restoreOperation) return;

                refreshFailed = true;
                refreshAuthMismatch = isSubscriptionRefreshAuthMismatch(error);

                if (__DEV__) {
                    console.warn("Failed to refresh subscription state after restore", error);
                }
            }

            if (refreshAuthMismatch) {
                setSubscriptionForUser(userId, false);
                triggerWarningHaptic();
                Alert.alert(
                    SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE,
                    RESTORE_SESSION_CHANGED_MESSAGE
                );
                return;
            }

            const isActive = hasActiveClientSubscription || hasActiveServerSubscription;
            if (!setSubscriptionForUser(userId, isActive)) {
                triggerWarningHaptic();
                Alert.alert(
                    SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE,
                    RESTORE_SESSION_CHANGED_MESSAGE
                );
                return;
            }

            if (isActive) {
                triggerStrongImpactHaptic();

                if (refreshFailed) {
                    retrySubscriptionStateAfterRevenueCatUpdateInBackground(userId);
                    Alert.alert(
                        "Purchases restored",
                        "Your subscription is active. We are still syncing it to SAPO and will keep trying automatically."
                    );
                } else {
                    Alert.alert("Purchases restored", "Your subscription is active on this account.");
                }
                return;
            }

            triggerWarningHaptic();
            Alert.alert("No purchases found", "No active subscriptions were found for this account.");
        } catch (error) {
            if (activeRestoreRef.current !== restoreOperation) return;

            if (isReceiptAlreadyInUseRevenueCatError(error)) {
                if (!setSubscriptionForUser(userId, false)) {
                    triggerWarningHaptic();
                    Alert.alert(
                        SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE,
                        RESTORE_SESSION_CHANGED_MESSAGE
                    );
                    return;
                }

                triggerWarningHaptic();
                Alert.alert(
                    SUBSCRIPTION_LINKED_ELSEWHERE_ALERT_TITLE,
                    getSubscriptionLinkedElsewhereMessage(storeAccountLabel)
                );
                return;
            }

            if (__DEV__) {
                console.warn("Restore purchases failed", error);
            }

            triggerErrorHaptic();
            Alert.alert("Restore failed", RESTORE_PURCHASES_ERROR_MESSAGE);
        } finally {
            if (activeRestoreRef.current === restoreOperation) {
                activeRestoreRef.current = null;
                setIsRestoringPurchases(false);
            }
        }
    }, [
        canUseRevenueCat,
        isPending,
        isRestoringPurchases,
        isSigningOut,
        setSubscriptionForUser,
        storeAccountLabel,
        userId,
    ]);

    const handleManageSubscription = useCallback(async () => {
        if (
            isPending ||
            isSigningOut ||
            isManagingSubscription ||
            !userId ||
            !isRevenueCatSupportedPlatform ||
            !canUseRevenueCat
        ) {
            return;
        }

        try {
            setIsManagingSubscription(true);
            const didOpenManagement = await openRevenueCatManagementUrl(userId);

            if (!didOpenManagement) {
                Alert.alert(
                    "No active subscription",
                    `We could not find an active ${storeAccountLabel} subscription to manage for this account.`
                );
            }
        } catch (error) {
            if (__DEV__) {
                console.warn("Unable to open subscription settings", error);
            }

            Alert.alert("Unable to open subscription settings", MANAGE_SUBSCRIPTION_ERROR_MESSAGE);
        } finally {
            setIsManagingSubscription(false);
        }
    }, [
        canUseRevenueCat,
        isManagingSubscription,
        isPending,
        isSigningOut,
        storeAccountLabel,
        userId,
    ]);

    const handleSignOut = useCallback(async () => {
        if (isPending || isSigningOut || isManagingSubscription) {
            return;
        }

        if (activeRestoreRef.current !== null) {
            activeRestoreRef.current = null;
            setIsRestoringPurchases(false);
        }

        triggerLightImpactHaptic();

        try {
            setIsSigningOut(true);
            await authClient.signOut();
            router.dismissTo(APP_ROUTES.HOME);
        } catch {
            Alert.alert("Something went wrong", "Unable to sign out. Please try again.");
            setIsSigningOut(false);
        }
    }, [isManagingSubscription, isPending, isSigningOut, router]);

    return {
        handleManageSubscription,
        handleOpenDataControls,
        handleOpenLocalModels,
        handleOpenSubscription,
        handleRestorePurchases,
        handleSignIn,
        handleSignOut,
        isManageSubscriptionDisabled,
        isManagingSubscription,
        isPending,
        isRestorePurchasesDisabled,
        isRestoringPurchases,
        isSigningOut,
        shouldShowAuthenticatedActions,
    };
}
