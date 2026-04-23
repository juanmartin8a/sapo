import { useCallback, useState } from "react";
import { Alert, Platform, StyleSheet, View } from "react-native";

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
    const { data: session, isPending } = authClient.useSession();
    const user = session?.user;
    const authState = getSessionUserAuthState(user);
    const isAuthenticatedUser = authState === "authenticated";
    const canDeleteAccount = isAuthenticatedUser;
    const userId = isAuthenticatedUser ? user?.id ?? null : null;
    const [isProcessing, setIsProcessing] = useState(false);

    const handleDeleteAccount = useCallback(async () => {
        if (isPending || !canDeleteAccount || isProcessing) {
            return;
        }

        setIsProcessing(true);

        const storeAccountLabel =
            Platform.OS === "android" ? "Google" : Platform.OS === "ios" ? "Apple" : "store";
        let hasActiveSubscription = false;

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

        setIsProcessing(false);

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
                            setIsProcessing(true);
                            await authClient.deleteUser({
                                callbackURL: "/",
                            });
                            setIsProcessing(false);
                            Alert.alert(
                                "Check your email",
                                "We sent a verification link to confirm account deletion."
                            );
                        } catch {
                            setIsProcessing(false);
                            Alert.alert("Something went wrong", "Unable to delete the account. Please try again.");
                        }
                    },
                },
            ]
        );
    }, [canDeleteAccount, isPending, isProcessing, userId]);

    return (
        <View style={styles.container}>
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
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#E1ECDD",
        paddingTop: 24,
        paddingHorizontal: 16,
    },
});
