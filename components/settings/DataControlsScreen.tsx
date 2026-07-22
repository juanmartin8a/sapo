import { useCallback, useRef, useState } from "react";
import { useHeaderHeight } from "expo-router/react-navigation";
import { Alert, Platform, ScrollView, StyleSheet, View } from "react-native";

import TrashIcon from "@/assets/icons/trash.svg";
import { authClient } from "@/lib/auth-client";
import { APP_ROUTES } from "@/constants/routes";
import {
    SETTINGS_COLORS,
    SETTINGS_HEADER_CONTENT_GAP,
    SETTINGS_SCREEN_HORIZONTAL_PADDING,
} from "@/constants/settings";
import { getStoreAccountLabel } from "@/constants/subscription";
import {
    getRevenueCatCustomerInfo,
    hasActiveRevenueCatSubscription,
    hasRevenueCatConfig,
    isRevenueCatSupportedPlatform,
} from "@/lib/revenuecat";
import SettingsButton from "@/components/settings/SettingsButton";
import { getSessionUserAuthState } from "@/utils/auth";
import { triggerErrorHaptic, triggerLightImpactHaptic, triggerStrongImpactHaptic } from "@/lib/haptics";

const getDeleteAccountAlertMessage = (args: {
    hasActiveSubscription: boolean;
    storeAccountLabel: string;
}) => {
    if (!args.hasActiveSubscription) {
        return "This action will permanently delete your SAPO account and data. Continue?";
    }

    return `This action will permanently delete your SAPO account and data. Your subscription is managed by ${args.storeAccountLabel}, not SAPO, so deleting your account will not cancel store billing. Manage or cancel your subscription in your ${args.storeAccountLabel} subscription settings before deleting your account if needed. Continue?`;
};

export default function DataControlsScreen() {
    const headerHeight = useHeaderHeight();
    const { data: session, isPending } = authClient.useSession();
    const user = session?.user;
    const authState = getSessionUserAuthState(user);
    const isAuthenticatedUser = authState === "authenticated";
    const canDeleteAccount = isAuthenticatedUser;
    const userId = isAuthenticatedUser ? user?.id ?? null : null;
    const [isProcessing, setIsProcessing] = useState(false);
    const isPreparingDeleteAlertRef = useRef(false);

    const requestAccountDeletion = useCallback(async () => {
        const result = await authClient.deleteUser({
            callbackURL: APP_ROUTES.HOME,
        });

        if (result.error) {
            if (__DEV__) {
                console.warn("Delete account request failed", result.error);
            }

            throw new Error("Unable to delete the account.");
        }
    }, []);

    const handleDeleteAccount = useCallback(async () => {
        if (isPending || !canDeleteAccount || isProcessing || isPreparingDeleteAlertRef.current) {
            return;
        }

        isPreparingDeleteAlertRef.current = true;

        const storeAccountLabel = getStoreAccountLabel(Platform.OS);
        let hasActiveSubscription = false;

        try {
            if (
                userId &&
                isRevenueCatSupportedPlatform &&
                hasRevenueCatConfig()
            ) {
                try {
                    const customerInfo = await getRevenueCatCustomerInfo(userId);
                    hasActiveSubscription = customerInfo
                        ? hasActiveRevenueCatSubscription(customerInfo)
                        : false;
                } catch {
                    hasActiveSubscription = true;
                }
            }
        } finally {
            isPreparingDeleteAlertRef.current = false;
        }

        Alert.alert(
            "Delete account",
            getDeleteAccountAlertMessage({
                hasActiveSubscription,
                storeAccountLabel,
            }),
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            triggerLightImpactHaptic();
                            setIsProcessing(true);
                            await requestAccountDeletion();
                            triggerStrongImpactHaptic();
                            Alert.alert(
                                "Check your email",
                                "We sent a verification link to confirm account deletion."
                            );
                        } catch {
                            triggerErrorHaptic();
                            Alert.alert("Something went wrong", "Unable to delete the account. Please try again.");
                        } finally {
                            setIsProcessing(false);
                        }
                    }
                },
            ]
        );
    }, [canDeleteAccount, isPending, isProcessing, requestAccountDeletion, userId]);

    return (
        <View style={styles.container}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[styles.contentContainer, { paddingTop: headerHeight + SETTINGS_HEADER_CONTENT_GAP }]}
            >
                <SettingsButton
                    text={
                        !isAuthenticatedUser
                            ? "Sign in to manage data"
                            : isProcessing
                              ? "Preparing deletion..."
                              : "Delete account"
                    }
                    leftIcon={TrashIcon}
                    backgroundColor="#CDDEC8"
                    borderRadius={22}
                    textColor={SETTINGS_COLORS.destructiveText}
                    iconColor={SETTINGS_COLORS.destructiveText}
                    loading={isProcessing}
                    disabled={isPending || isProcessing || !canDeleteAccount}
                    onPress={handleDeleteAccount}
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
    },
});
