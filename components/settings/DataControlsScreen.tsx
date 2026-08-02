import { useCallback, useRef, useState } from "react";
import { FieldGroup, Text } from "@expo/ui";
import { font } from "@expo/ui/swift-ui/modifiers";
import { Alert, Platform } from "react-native";

import { authClient } from "@/lib/auth-client";
import { useAuthState } from "@/providers/AuthStateProvider";
import { APP_ROUTES } from "@/constants/routes";
import { SETTINGS_COLORS } from "@/constants/settings";
import { getStoreAccountLabel } from "@/constants/subscription";
import {
    getRevenueCatCustomerInfo,
    hasActiveRevenueCatSubscription,
    hasRevenueCatConfig,
    isRevenueCatSupportedPlatform,
} from "@/lib/revenuecat";
import SettingsForm from "@/components/settings/SettingsForm";
import SettingsRow from "@/components/settings/SettingsRow";
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
    const { status: authStatus, userId } = useAuthState();
    const isPending = authStatus === "checking";
    const isAuthenticatedUser = authStatus === "authenticated";
    const canDeleteAccount = isAuthenticatedUser;
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
        <SettingsForm>
            <FieldGroup.Section title="Account">
                <SettingsRow
                    label={
                        !isAuthenticatedUser
                            ? "Sign in to manage data"
                            : isProcessing
                              ? "Preparing deletion..."
                              : "Delete account"
                    }
                    icon="trash"
                    destructive
                    loading={isProcessing}
                    disabled={isPending || isProcessing || !canDeleteAccount}
                    onPress={handleDeleteAccount}
                />
                <FieldGroup.SectionFooter>
                    <Text
                        modifiers={Platform.OS === "ios" ? [font({ textStyle: "footnote", weight: "regular" })] : undefined}
                        textStyle={{ color: SETTINGS_COLORS.mutedText, fontSize: Platform.OS === "ios" ? undefined : 13 }}
                    >
                        Deleting your account permanently removes your SAPO account and data. Store subscriptions must be cancelled separately.
                    </Text>
                </FieldGroup.SectionFooter>
            </FieldGroup.Section>
        </SettingsForm>
    );
}
