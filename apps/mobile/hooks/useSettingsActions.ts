import { useCallback, useEffect, useRef, useState } from "react";
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
import { signOutCurrentSession } from "@/lib/auth-session";
import {
    triggerErrorHaptic,
    triggerLightImpactHaptic,
    triggerStrongImpactHaptic,
    triggerWarningHaptic,
} from "@/lib/haptics";
import {
    hasActiveRevenueCatSubscription,
    hasRevenueCatConfig,
    isReceiptAlreadyInUseRevenueCatError,
    isRevenueCatSupportedPlatform,
    openRevenueCatManagementUrl,
    runRevenueCatOperationForUser,
} from "@/lib/revenuecat";
import {
    isSubscriptionReconciliationAuthMismatch,
    isPendingSubscriptionReconciliation,
    reconcileObservedSubscriptionState,
} from "@/lib/subscription-reconciliation";
import { useAuthState } from "@/providers/AuthStateProvider";
import useRevenueCatOfferingStore from "@/stores/revenueCatOfferingStore";
import useSubscriptionStatusStore from "@/stores/subscriptionStatusStore";

const RESTORE_PURCHASES_ERROR_MESSAGE = "Unable to restore purchases. Please try again.";
const MANAGE_SUBSCRIPTION_ERROR_MESSAGE = "Unable to open subscription settings. Please try again.";
const RESTORE_SESSION_CHANGED_MESSAGE =
    "Your account changed while syncing purchases. Please sign in again and retry.";

export default function useSettingsActions() {
    const router = useRouter();
    const { status: authStatus, userId } = useAuthState();
    const [isSigningOut, setIsSigningOut] = useState(false);
    const [restoringUserId, setRestoringUserId] = useState<string | null>(null);
    const [isManagingSubscription, setIsManagingSubscription] = useState(false);
    const activeRestoreRef = useRef<symbol | null>(null);
    const setLinkedElsewhereUser = useRevenueCatOfferingStore(
        (state) => state.setLinkedElsewhereUser
    );
    const requestRevenueCatIdentitySync = useRevenueCatOfferingStore(
        (state) => state.requestIdentitySync
    );
    const currentUserIdRef = useRef(userId);
    const isRestoringPurchases = Boolean(userId && restoringUserId === userId);
    const isPending = authStatus === "checking";
    const isAuthenticatedUser = authStatus === "authenticated";
    const canUseRevenueCat = hasRevenueCatConfig();
    const storeAccountLabel = getStoreAccountLabel(Platform.OS);
    const shouldShowAuthenticatedActions = isAuthenticatedUser || isSigningOut;

    useEffect(() => {
        currentUserIdRef.current = userId;
    }, [userId]);

    useEffect(() => {
        return () => {
            activeRestoreRef.current = null;
        };
    }, []);
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
        const isCurrentRestore = () =>
            activeRestoreRef.current === restoreOperation &&
            currentUserIdRef.current === userId &&
            useSubscriptionStatusStore.getState().userId === userId;

        try {
            setRestoringUserId(userId);
            const customerInfo = await runRevenueCatOperationForUser(
                userId,
                () => Purchases.restorePurchases(),
                isCurrentRestore
            );
            if (!customerInfo || !isCurrentRestore()) return;
            setLinkedElsewhereUser(null);
            requestRevenueCatIdentitySync();

            const hasActiveClientSubscription = hasActiveRevenueCatSubscription(customerInfo);
            let reconciliationStatus: Awaited<
                ReturnType<typeof reconcileObservedSubscriptionState>
            >["status"] | null = null;
            let reconciliationError: unknown = null;

            try {
                const reconciliationResult = await reconcileObservedSubscriptionState({
                    userId,
                    observedActive: hasActiveClientSubscription,
                });
                if (!isCurrentRestore()) return;

                reconciliationStatus = reconciliationResult.status;
            } catch (error) {
                if (!isCurrentRestore()) return;

                reconciliationError = error;

                if (__DEV__) {
                    console.warn("Failed to reconcile subscription state after restore", error);
                }
            }

            if (isSubscriptionReconciliationAuthMismatch(reconciliationError)) {
                triggerWarningHaptic();
                Alert.alert(
                    SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE,
                    RESTORE_SESSION_CHANGED_MESSAGE
                );
                return;
            }

            if (reconciliationError) {
                if (!hasActiveClientSubscription) {
                    triggerWarningHaptic();
                    Alert.alert(
                        "Restore completed",
                        "Purchases were restored, but SAPO could not verify your subscription status. Please try again shortly."
                    );
                    return;
                }

                triggerWarningHaptic();
                Alert.alert(
                    "Purchases restored",
                    "Your subscription was found, but SAPO could not verify it yet. Please try restoring again shortly."
                );
                return;
            }

            if (
                !reconciliationStatus ||
                useSubscriptionStatusStore.getState().userId !== userId
            ) {
                triggerWarningHaptic();
                Alert.alert(
                    SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE,
                    RESTORE_SESSION_CHANGED_MESSAGE
                );
                return;
            }

            if (reconciliationStatus === "active") {
                triggerStrongImpactHaptic();
                Alert.alert("Purchases restored", "Your subscription is active on this account.");
                return;
            }

            if (isPendingSubscriptionReconciliation(reconciliationStatus)) {
                triggerWarningHaptic();
                Alert.alert(
                    "Purchases restored",
                    "Your subscription was found and is still syncing to SAPO. Please check again shortly."
                );
                return;
            }

            triggerWarningHaptic();
            Alert.alert("No purchases found", "No active subscriptions were found for this account.");
        } catch (error) {
            if (!isCurrentRestore()) return;

            if (isReceiptAlreadyInUseRevenueCatError(error)) {
                if (useSubscriptionStatusStore.getState().userId !== userId) {
                    triggerWarningHaptic();
                    Alert.alert(
                        SUBSCRIPTION_SESSION_CHANGED_ALERT_TITLE,
                        RESTORE_SESSION_CHANGED_MESSAGE
                    );
                    return;
                }

                setLinkedElsewhereUser(userId);
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
                setRestoringUserId(null);
            }
        }
    }, [
        canUseRevenueCat,
        isPending,
        isRestoringPurchases,
        isSigningOut,
        requestRevenueCatIdentitySync,
        setLinkedElsewhereUser,
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

        const isCurrentManagement = () => currentUserIdRef.current === userId;

        try {
            setIsManagingSubscription(true);
            const didOpenManagement = await openRevenueCatManagementUrl(
                userId,
                isCurrentManagement
            );

            if (!isCurrentManagement()) {
                return;
            }

            if (!didOpenManagement) {
                Alert.alert(
                    "No active subscription",
                    `We could not find an active ${storeAccountLabel} subscription to manage for this account.`
                );
            }
        } catch (error) {
            if (!isCurrentManagement()) {
                return;
            }

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
            setRestoringUserId(null);
        }

        triggerLightImpactHaptic();

        try {
            setIsSigningOut(true);
            await signOutCurrentSession();
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
