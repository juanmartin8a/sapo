import { useCallback, useEffect, useRef, useState } from "react";
import { FieldGroup, Text } from "@expo/ui";
import { font } from "@expo/ui/swift-ui/modifiers";
import { Alert, Platform } from "react-native";

import { authClient } from "@/lib/auth-client";
import { useAuthState } from "@/providers/AuthStateProvider";
import { APP_ROUTES } from "@/constants/routes";
import {
    SETTINGS_ANDROID_FOOTNOTE_FONT_SIZE,
    SETTINGS_COLORS,
} from "@/constants/settings";
import { getStoreAccountLabel } from "@/constants/subscription";
import {
    getRevenueCatCustomerInfo,
    hasActiveRevenueCatSubscription,
    hasRevenueCatConfig,
    isRevenueCatSupportedPlatform,
} from "@/lib/revenuecat";
import SettingsForm from "@/components/settings/ui/SettingsForm";
import SettingsRow from "@/components/settings/ui/SettingsRow";
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
    const { status: authStatus, sessionId, userId } = useAuthState();
    const isPending = authStatus === "checking";
    const isAuthenticatedUser = authStatus === "authenticated";
    const canDeleteAccount = isAuthenticatedUser;
    const [isProcessing, setIsProcessing] = useState(false);
    const isPreparingDeleteAlertRef = useRef(false);
    const activeDeleteAlertRef = useRef<symbol | null>(null);
    const currentAccountRef = useRef({ authStatus, sessionId, userId });

    useEffect(() => {
        currentAccountRef.current = { authStatus, sessionId, userId };
        activeDeleteAlertRef.current = null;
        isPreparingDeleteAlertRef.current = false;
    }, [authStatus, sessionId, userId]);

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
        if (
            isPending ||
            !canDeleteAccount ||
            isProcessing ||
            isPreparingDeleteAlertRef.current ||
            activeDeleteAlertRef.current !== null ||
            !userId ||
            !sessionId
        ) {
            return;
        }

        const deleteAlert = Symbol("delete-account-alert");
        const expectedUserId = userId;
        const expectedSessionId = sessionId;
        const clearDeleteAlert = () => {
            if (activeDeleteAlertRef.current === deleteAlert) {
                activeDeleteAlertRef.current = null;
            }
        };
        const isCurrentAccount = () => {
            const currentAccount = currentAccountRef.current;
            return (
                activeDeleteAlertRef.current === deleteAlert &&
                currentAccount.authStatus === "authenticated" &&
                currentAccount.userId === expectedUserId &&
                currentAccount.sessionId === expectedSessionId
            );
        };
        const hasCurrentSession = async () => {
            try {
                const latestSession = (await authClient.getSession()).data;
                return (
                    isCurrentAccount() &&
                    latestSession?.user.id === expectedUserId &&
                    latestSession.session.id === expectedSessionId
                );
            } catch {
                return false;
            }
        };

        activeDeleteAlertRef.current = deleteAlert;
        isPreparingDeleteAlertRef.current = true;

        const storeAccountLabel = getStoreAccountLabel(Platform.OS);
        let hasActiveSubscription = false;

        try {
            if (isRevenueCatSupportedPlatform && hasRevenueCatConfig()) {
                try {
                    const customerInfo = await getRevenueCatCustomerInfo(
                        expectedUserId,
                        isCurrentAccount
                    );
                    if (!customerInfo || !isCurrentAccount()) {
                        return;
                    }

                    hasActiveSubscription = hasActiveRevenueCatSubscription(customerInfo);
                } catch {
                    if (!isCurrentAccount()) {
                        return;
                    }

                    hasActiveSubscription = true;
                }
            }
        } finally {
            isPreparingDeleteAlertRef.current = false;
        }

        if (!isCurrentAccount() || !(await hasCurrentSession())) {
            clearDeleteAlert();
            return;
        }

        Alert.alert(
            "Delete account",
            getDeleteAccountAlertMessage({
                hasActiveSubscription,
                storeAccountLabel,
            }),
            [
                {
                    text: "Cancel",
                    style: "cancel",
                    onPress: clearDeleteAlert,
                },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        if (!isCurrentAccount() || !(await hasCurrentSession())) {
                            clearDeleteAlert();
                            return;
                        }

                        try {
                            triggerLightImpactHaptic();
                            setIsProcessing(true);
                            await requestAccountDeletion();

                            if (!isCurrentAccount()) {
                                return;
                            }

                            triggerStrongImpactHaptic();
                            Alert.alert(
                                "Check your email",
                                "We sent a verification link to confirm account deletion."
                            );
                        } catch {
                            if (!isCurrentAccount()) {
                                return;
                            }

                            triggerErrorHaptic();
                            Alert.alert("Something went wrong", "Unable to delete the account. Please try again.");
                        } finally {
                            clearDeleteAlert();
                            setIsProcessing(false);
                        }
                    },
                },
            ],
            {
                onDismiss: clearDeleteAlert,
            }
        );
    }, [canDeleteAccount, isPending, isProcessing, requestAccountDeletion, sessionId, userId]);

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
                        textStyle={{
                            color: SETTINGS_COLORS.mutedText,
                            fontSize: Platform.OS === "ios"
                                ? undefined
                                : SETTINGS_ANDROID_FOOTNOTE_FONT_SIZE,
                        }}
                    >
                        Deleting your account permanently removes your SAPO account and data. Store subscriptions must be cancelled separately.
                    </Text>
                </FieldGroup.SectionFooter>
            </FieldGroup.Section>
        </SettingsForm>
    );
}
