import { useCallback, useRef, useState } from "react";
import { useHeaderHeight } from "expo-router/react-navigation";
import { Alert, Platform, ScrollView, StyleSheet, View } from "react-native";

import TrashIcon from "@/assets/icons/trash.svg";
import { authClient } from "@/clients/auth-client";
import {
    getRevenueCatCustomerInfo,
    hasActiveRevenueCatSubscription,
    hasRevenueCatConfig,
    isRevenueCatSupportedPlatform,
} from "@/clients/revenuecat";
import SettingsButton from "@/components/settings-modal/SettingsButton";
import { getSessionUserAuthState } from "@/utils/auth";
import { triggerErrorHaptic, triggerLightImpactHaptic, triggerStrongImpactHaptic } from "@/utils/haptics";

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
            callbackURL: "/",
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

        const storeAccountLabel =
            Platform.OS === "android" ? "Google" : Platform.OS === "ios" ? "Apple" : "store";
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
            <ScrollView contentContainerStyle={[styles.contentContainer, { paddingTop: headerHeight + 24 }]}>
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
                    textColor="#8B332A"
                    iconColor="#8B332A"
                    loading={isProcessing}
                    disabled={isPending || isProcessing || !canDeleteAccount}
                    onPress={handleDeleteAccount}
                />
                <View style={{ height: 1000, backgroundColor: "green" }}>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#E1ECDD",
    },
    contentContainer: {
        paddingHorizontal: 16,
    },
});
