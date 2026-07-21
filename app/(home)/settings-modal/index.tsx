import { useCallback, useState } from "react";
import { useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import Purchases from "react-native-purchases";

import LogInIcon from "@/assets/icons/log-in.svg";
import LogOutIcon from "@/assets/icons/log-out.svg";
import RepeatIcon from "@/assets/icons/repeat.svg";
import EarthIcon from "@/assets/icons/earth.svg";
import SettingsIcon from "@/assets/icons/settings.svg";
import BrainIcon from "@/assets/icons/brain.svg";
import SlidersHorizontalIcon from "@/assets/icons/sliders-horizontal.svg";
import { authClient } from "@/clients/auth-client";
import { APP_ROUTES } from "@/constants/routes";
import {
    SETTINGS_COLORS,
    SETTINGS_HEADER_CONTENT_GAP,
    SETTINGS_SCREEN_BOTTOM_PADDING,
    SETTINGS_SCREEN_HORIZONTAL_PADDING,
} from "@/constants/settings";
import {
    getStoreAccountLabel,
    getSubscriptionLinkedElsewhereMessage,
    SUBSCRIPTION_LINKED_ELSEWHERE_ALERT_TITLE,
} from "@/constants/subscription";
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
import { triggerErrorHaptic, triggerLightImpactHaptic, triggerStrongImpactHaptic, triggerWarningHaptic } from "@/utils/haptics";

const RESTORE_PURCHASES_ERROR_MESSAGE = "Unable to restore purchases. Please try again.";
const MANAGE_SUBSCRIPTION_ERROR_MESSAGE = "Unable to open subscription settings. Please try again.";

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
    const headerHeight = useHeaderHeight();
    const router = useRouter();
    const { data: session, isPending } = authClient.useSession();
    const user = session?.user;
    const authState = getSessionUserAuthState(user);
    const isAuthenticatedUser = authState === "authenticated";
    const userId = isAuthenticatedUser ? user?.id ?? null : null;
    const setSubscriptionForUser = useSubscriptionStatusStore((state) => state.setForUser);
    const [isSigningOut, setIsSigningOut] = useState(false);
    const [isRestoringPurchases, setIsRestoringPurchases] = useState(false);
    const [isManagingSubscription, setIsManagingSubscription] = useState(false);
    const canUseRevenueCat = hasRevenueCatConfig();
    const storeAccountLabel = getStoreAccountLabel(Platform.OS);
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
        router.push(APP_ROUTES.SUBSCRIPTION);
    }, [router]);

    const handleOpenDataControls = useCallback(() => {
        router.push(APP_ROUTES.DATA_CONTROLS);
    }, [router]);

    const handleOpenLocalModel = useCallback(() => {
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
            !userId ||
            !isRevenueCatSupportedPlatform ||
            !canUseRevenueCat
        ) {
            return;
        }

        triggerLightImpactHaptic();

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
                setSubscriptionForUser(userId, false);
                triggerWarningHaptic();
                Alert.alert("Session changed", getSubscriptionSessionChangedMessage());
                return;
            }

            const isActive = hasActiveClientSubscription || hasActiveServerSubscription;

            if (!setSubscriptionForUser(userId, isActive)) {
                triggerWarningHaptic();
                Alert.alert("Session changed", getSubscriptionSessionChangedMessage());
                return;
            }

            if (isActive) {
                triggerStrongImpactHaptic();

                if (refreshFailed) {
                    retryRevenueCatUpdateSyncInBackground(userId);
                    Alert.alert("Purchases restored", getRestoreSyncPendingMessage());
                } else {
                    Alert.alert("Purchases restored", "Your subscription is active on this account.");
                }

                return;
            }

            triggerWarningHaptic();
            Alert.alert("No purchases found", "No active subscriptions were found for this account.");
        } catch (error) {
            if (isReceiptAlreadyInUseRevenueCatError(error)) {
                if (!setSubscriptionForUser(userId, false)) {
                    triggerWarningHaptic();
                    Alert.alert("Session changed", getSubscriptionSessionChangedMessage());
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
            setIsRestoringPurchases(false);
        }
    }, [
        canUseRevenueCat,
        isPending,
        isSigningOut,
        isRestoringPurchases,
        setSubscriptionForUser,
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
            router.dismissTo(APP_ROUTES.HOME);
        } catch {
            Alert.alert("Something went wrong", "Unable to sign out. Please try again.");
            setIsSigningOut(false);
        }
    }, [isManagingSubscription, isPending, isRestoringPurchases, isSigningOut, router]);

    return (
        <View style={styles.container}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[styles.contentContainer, { paddingTop: headerHeight + SETTINGS_HEADER_CONTENT_GAP }]}
            >
                <View style={styles.sectionContainer}>
                    <Text style={styles.sectionLabel}>Account</Text>
                    <GroupedList backgroundColor={SETTINGS_COLORS.surface} borderRadius={24} showDividers={true}>
                        <SettingsButton
                            text="Subscription"
                            leftIcon={EarthIcon}
                            showChevron
                            textColor={SETTINGS_COLORS.primaryText}
                            iconColor={SETTINGS_COLORS.primaryText}
                            chevronColor={SETTINGS_COLORS.mutedChevron}
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
                            textColor={SETTINGS_COLORS.primaryText}
                            iconColor={SETTINGS_COLORS.primaryText}
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
                            textColor={SETTINGS_COLORS.primaryText}
                            iconColor={SETTINGS_COLORS.primaryText}
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
                        leftIcon={BrainIcon}
                        showChevron
                        backgroundColor={SETTINGS_COLORS.surface}
                        borderRadius={22}
                        textColor={SETTINGS_COLORS.primaryText}
                        iconColor={SETTINGS_COLORS.primaryText}
                        chevronColor={SETTINGS_COLORS.mutedChevron}
                        disabled={isSigningOut}
                        onPress={handleOpenLocalModel}
                    />
                </View>
                {shouldShowAuthenticatedActions ? (
                    <SettingsButton
                        text="Data controls"
                        leftIcon={SlidersHorizontalIcon}
                        showChevron
                        backgroundColor={SETTINGS_COLORS.surface}
                        borderRadius={22}
                        textColor={SETTINGS_COLORS.primaryText}
                        iconColor={SETTINGS_COLORS.primaryText}
                        chevronColor={SETTINGS_COLORS.mutedChevron}
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
                    textColor={SETTINGS_COLORS.primaryText}
                    iconColor={SETTINGS_COLORS.primaryText}
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
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: SETTINGS_COLORS.screenBackground,
    },
    scrollView: {
        flex: 1,
    },
    contentContainer: {
        flexGrow: 1,
        paddingHorizontal: SETTINGS_SCREEN_HORIZONTAL_PADDING,
        paddingBottom: SETTINGS_SCREEN_BOTTOM_PADDING,
        gap: 12,
    },
    sectionContainer: {
        gap: 6,
    },
    sectionLabel: {
        fontSize: 14,
        fontWeight: 600,
        color: SETTINGS_COLORS.mutedText,
        paddingHorizontal: 4,
    },
});
