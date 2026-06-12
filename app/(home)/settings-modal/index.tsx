import { useCallback, useState } from "react";
import { useRouter, type Href } from "expo-router";
import { Alert, Platform, StyleSheet, Text, View } from "react-native";
import Purchases from "react-native-purchases";

import LogInIcon from "@/assets/icons/log-in.svg";
import LogOutIcon from "@/assets/icons/log-out.svg";
import RepeatIcon from "@/assets/icons/repeat.svg";
import EarthIcon from "@/assets/icons/earth.svg";
import SettingsIcon from "@/assets/icons/settings.svg";
import { authClient } from "@/clients/auth-client";
import {
    configureRevenueCat,
    hasActiveRevenueCatSubscription,
    hasRevenueCatConfig,
    isReceiptAlreadyInUseRevenueCatError,
    isRevenueCatSupportedPlatform,
    openRevenueCatManagementUrl,
} from "@/clients/revenuecat";
import {
    getSubscriptionRefreshErrorStatus,
    refreshSubscriptionState,
    refreshSubscriptionStateAfterRevenueCatUpdate,
    retrySubscriptionStateAfterRevenueCatUpdateInBackground,
} from "@/clients/subscription-refresh";
import GroupedList from "@/components/settings-modal/GroupedList";
import SettingsButton from "@/components/settings-modal/SettingsButton";
import useSubscriptionStatusStore from "@/stores/subscriptionStatusStore";
import { getSessionUserAuthState } from "@/utils/auth";

const colors = {
    screenBackground: "#E1ECDD",
    sectionLabel: "#647C61",
    accountButtonBackground: "#C5D8C0",
    primaryText: "#1E3526",
    mutedChevron: "#5E755A",
    destructiveText: "#8B332A",
};

const LOCAL_MODEL_ROUTE = "/settings-modal/local-models" as Href;

const RESTORE_PURCHASES_ERROR_MESSAGE = "Unable to restore purchases. Please try again.";
const MANAGE_SUBSCRIPTION_ERROR_MESSAGE = "Unable to open subscription settings. Please try again.";

const getSubscriptionLinkedElsewhereMessage = (storeAccountLabel: string) => {
    return `This ${storeAccountLabel} account already has a S A P O subscription linked to another S A P O account. Please sign in to that account, or contact us for support at support@sapo.surf.`;
};

const getRestoreSyncPendingMessage = () => {
    return "Your subscription is active. We are still syncing it to SAPO and will keep trying automatically.";
};

const getSubscriptionSessionChangedMessage = () => {
    return "Your account changed while syncing purchases. Please sign in again and retry.";
};

const retryRevenueCatUpdateSyncInBackground = (userId: string) => {
    void retrySubscriptionStateAfterRevenueCatUpdateInBackground(userId).catch((error) => {
        if (__DEV__) {
            console.warn("Background subscription sync retry failed", error);
        }
    });
};

export default function SettingsModalScreen() {
    const router = useRouter();
    const { data: session, isPending } = authClient.useSession();
    const user = session?.user;
    const authState = getSessionUserAuthState(user);
    const isAuthenticatedUser = authState === "authenticated";
    const userId = isAuthenticatedUser ? user?.id ?? null : null;
    const setHasActiveSubscription = useSubscriptionStatusStore(
        (state) => state.setHasActiveSubscription
    );
    const [isSigningOut, setIsSigningOut] = useState(false);
    const [isRestoringPurchases, setIsRestoringPurchases] = useState(false);
    const [isManagingSubscription, setIsManagingSubscription] = useState(false);
    const canUseRevenueCat = hasRevenueCatConfig();
    const storeAccountLabel =
        Platform.OS === "android" ? "Google" : Platform.OS === "ios" ? "Apple" : "store";
    const shouldShowAuthenticatedActions = isAuthenticatedUser || isSigningOut;
    const isRestorePurchasesDisabled =
        isPending ||
        isSigningOut ||
        isManagingSubscription ||
        isRestoringPurchases ||
        !userId ||
        !isRevenueCatSupportedPlatform ||
        !canUseRevenueCat;
    const isManageSubscriptionDisabled =
        isPending ||
        isSigningOut ||
        isRestoringPurchases ||
        isManagingSubscription ||
        !userId ||
        !isRevenueCatSupportedPlatform ||
        !canUseRevenueCat;

    const handleOpenSubscription = useCallback(() => {
        router.push("/settings-modal/subscription");
    }, [router]);

    const handleOpenDataControls = useCallback(() => {
        router.push("/settings-modal/data-controls");
    }, [router]);

    const handleOpenLocalModel = useCallback(() => {
        router.push(LOCAL_MODEL_ROUTE);
    }, [router]);

    const handleSignIn = useCallback(() => {
        router.push("/auth");
    }, [router]);

    const handleRestorePurchases = useCallback(async () => {
        if (
            isPending ||
            isSigningOut ||
            isRestoringPurchases ||
            !userId ||
            !isRevenueCatSupportedPlatform ||
            !canUseRevenueCat
        ) {
            return;
        }

        try {
            setIsRestoringPurchases(true);

            await configureRevenueCat(userId);

            const currentAppUserId = await Purchases.getAppUserID();

            if (currentAppUserId !== userId) {
                await Purchases.logIn(userId);
            }

            const customerInfo = await Purchases.restorePurchases();
            const hasActiveClientSubscription = hasActiveRevenueCatSubscription(customerInfo);
            let hasActiveServerSubscription = false;
            let refreshFailed = false;
            let refreshAuthMismatch = false;

            try {
                const refreshResult = hasActiveClientSubscription
                    ? await refreshSubscriptionStateAfterRevenueCatUpdate(userId)
                    : await refreshSubscriptionState({ userId });
                hasActiveServerSubscription = refreshResult?.has_active_subscription === true;
            } catch (error) {
                const refreshErrorStatus = getSubscriptionRefreshErrorStatus(error);

                refreshFailed = true;
                refreshAuthMismatch = refreshErrorStatus === 401 || refreshErrorStatus === 409;

                if (__DEV__) {
                    console.warn("Failed to refresh subscription state after restore", error);
                }
            }

            if (refreshAuthMismatch) {
                setHasActiveSubscription(false);
                Alert.alert("Session changed", getSubscriptionSessionChangedMessage());
                return;
            }

            const isActive = hasActiveClientSubscription || hasActiveServerSubscription;

            setHasActiveSubscription(isActive);

            if (isActive) {
                if (refreshFailed) {
                    retryRevenueCatUpdateSyncInBackground(userId);
                    Alert.alert("Purchases restored", getRestoreSyncPendingMessage());
                } else {
                    Alert.alert("Purchases restored", "Your subscription is active on this account.");
                }

                return;
            }

            Alert.alert("No purchases found", "No active subscriptions were found for this account.");
        } catch (error) {
            if (isReceiptAlreadyInUseRevenueCatError(error)) {
                setHasActiveSubscription(false);
                Alert.alert(
                    "Subscription linked elsewhere",
                    getSubscriptionLinkedElsewhereMessage(storeAccountLabel)
                );
                return;
            }

            if (__DEV__) {
                console.warn("Restore purchases failed", error);
            }

            Alert.alert("Restore failed", RESTORE_PURCHASES_ERROR_MESSAGE);
        } finally {
            setIsRestoringPurchases(false);
        }
    }, [
        canUseRevenueCat,
        isPending,
        isSigningOut,
        isRestoringPurchases,
        setHasActiveSubscription,
        storeAccountLabel,
        userId,
    ]);

    const handleManageSubscription = useCallback(async () => {
        if (
            isPending ||
            isSigningOut ||
            isRestoringPurchases ||
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
        isRestoringPurchases,
        isSigningOut,
        storeAccountLabel,
        userId,
    ]);

    const handleSignOut = useCallback(async () => {
        if (isPending || isSigningOut || isRestoringPurchases || isManagingSubscription) {
            return;
        }

        try {
            setIsSigningOut(true);
            await authClient.signOut();
            router.dismissTo("/");
        } catch {
            Alert.alert("Something went wrong", "Unable to sign out. Please try again.");
            setIsSigningOut(false);
        }
    }, [isManagingSubscription, isPending, isRestoringPurchases, isSigningOut, router]);

    return (
        <View style={styles.container}>
            <View style={styles.sectionContainer}>
                <Text style={styles.sectionLabel}>Account</Text>
                <GroupedList backgroundColor="#C5D8C0" borderRadius={24} showDividers={true}>
                    <SettingsButton
                        text="Subscription"
                        leftIcon={EarthIcon}
                        showChevron
                        textColor={colors.primaryText}
                        iconColor={colors.primaryText}
                        chevronColor={colors.mutedChevron}
                        disabled={isSigningOut}
                        onPress={handleOpenSubscription}
                    />
                    <SettingsButton
                        text={
                            !shouldShowAuthenticatedActions
                                ? "Sign in to restore purchases"
                                : isRestoringPurchases
                                  ? "Restoring purchases..."
                                  : "Restore purchases"
                        }
                        leftIcon={RepeatIcon}
                        textColor={colors.primaryText}
                        iconColor={colors.primaryText}
                        loading={isRestoringPurchases}
                        disabled={isRestorePurchasesDisabled}
                        onPress={() => {
                            void handleRestorePurchases();
                        }}
                    />
                    <SettingsButton
                        text={
                            !shouldShowAuthenticatedActions
                                ? "Sign in to manage subscription"
                                : isManagingSubscription
                                  ? "Opening subscription..."
                                  : "Manage subscription"
                        }
                        leftIcon={SettingsIcon}
                        textColor={colors.primaryText}
                        iconColor={colors.primaryText}
                        loading={isManagingSubscription}
                        disabled={isManageSubscriptionDisabled}
                        onPress={() => {
                            void handleManageSubscription();
                        }}
                    />
                </GroupedList>
            </View>
            <View style={styles.sectionContainer}>
                <Text style={styles.sectionLabel}>Device</Text>
                <SettingsButton
                    text="Local models"
                    leftIcon={SettingsIcon}
                    showChevron
                    backgroundColor={colors.accountButtonBackground}
                    borderRadius={22}
                    textColor={colors.primaryText}
                    iconColor={colors.primaryText}
                    chevronColor={colors.mutedChevron}
                    disabled={isSigningOut}
                    onPress={handleOpenLocalModel}
                />
            </View>
            {shouldShowAuthenticatedActions ? (
                <SettingsButton
                    text="Data controls"
                    leftIcon={SettingsIcon}
                    showChevron
                    backgroundColor={colors.accountButtonBackground}
                    borderRadius={22}
                    textColor={colors.primaryText}
                    iconColor={colors.primaryText}
                    chevronColor={colors.mutedChevron}
                    disabled={isSigningOut}
                    onPress={handleOpenDataControls}
                />
            ) : null}
            <SettingsButton
                text={
                    !shouldShowAuthenticatedActions
                        ? "Sign in"
                        : isSigningOut
                          ? "Logging out..."
                          : "Log out"
                }
                leftIcon={shouldShowAuthenticatedActions ? LogOutIcon : LogInIcon}
                textColor={colors.primaryText}
                iconColor={colors.primaryText}
                loading={isSigningOut}
                disabled={isPending || isSigningOut || isRestoringPurchases || isManagingSubscription}
                onPress={() => {
                    if (!shouldShowAuthenticatedActions) {
                        handleSignIn();
                        return;
                    }

                    void handleSignOut();
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.screenBackground,
        paddingTop: 24,
        paddingHorizontal: 16,
        gap: 12,
    },
    sectionContainer: {
        gap: 6,
    },
    sectionLabel: {
        fontSize: 14,
        fontWeight: 600,
        color: colors.sectionLabel,
        paddingHorizontal: 4,
    },
});
