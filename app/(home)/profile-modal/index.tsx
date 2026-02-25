import { useCallback, useState } from "react";
import { useRouter } from "expo-router";
import { Alert, Platform, StyleSheet, View } from "react-native";
import Purchases from "react-native-purchases";

import LogOutIcon from "@/assets/icons/log-out.svg";
import RepeatIcon from "@/assets/icons/repeat.svg";
import SettingsIcon from "@/assets/icons/settings.svg";
import { authClient } from "@/clients/auth-client";
import {
    configureRevenueCat,
    hasActiveRevenueCatSubscription,
    hasRevenueCatConfig,
    isReceiptAlreadyInUseRevenueCatError,
    isRevenueCatSupportedPlatform,
} from "@/clients/revenuecat";
import SettingsButton from "@/components/profile-modal/SettingsButton";
import useSubscriptionStatusStore from "@/stores/subscriptionStatusStore";

const getErrorMessage = (error: unknown) => {
    if (typeof error === "object" && error && "message" in error) {
        const message = error.message;

        if (typeof message === "string" && message.length > 0) {
            return message;
        }
    }

    return "Please try again.";
};

const getSubscriptionLinkedElsewhereMessage = (storeAccountLabel: string) => {
    return `This ${storeAccountLabel} account already has a S A P O subscription linked to another S A P O account. Please sign in to that account, or contact us for support at support@sapo.surf.`;
};

export default function ProfileModalScreen() {
    const router = useRouter();
    const { data: session, isPending } = authClient.useSession();
    const userId = session?.user?.id ?? null;
    const setHasActiveSubscription = useSubscriptionStatusStore(
        (state) => state.setHasActiveSubscription
    );
    const [isProcessing, setIsProcessing] = useState(false);
    const [isRestoringPurchases, setIsRestoringPurchases] = useState(false);
    const canUseRevenueCat = hasRevenueCatConfig();
    const storeAccountLabel =
        Platform.OS === "android" ? "Google" : Platform.OS === "ios" ? "Apple" : "store";
    const isRestorePurchasesDisabled =
        isPending ||
        isProcessing ||
        isRestoringPurchases ||
        !userId ||
        !isRevenueCatSupportedPlatform ||
        !canUseRevenueCat;

    const handleOpenSubscription = useCallback(() => {
        router.push("/profile-modal/subscription");
    }, [router]);

    const handleOpenDataControls = useCallback(() => {
        router.push("/profile-modal/data-controls");
    }, [router]);

    const handleRestorePurchases = useCallback(async () => {
        if (
            isPending ||
            isProcessing ||
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
            const isActive = hasActiveRevenueCatSubscription(customerInfo);

            setHasActiveSubscription(isActive);

            if (isActive) {
                Alert.alert("Purchases restored", "Your subscription is active on this account.");
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

            Alert.alert("Restore failed", getErrorMessage(error));
        } finally {
            setIsRestoringPurchases(false);
        }
    }, [
        canUseRevenueCat,
        isPending,
        isProcessing,
        isRestoringPurchases,
        setHasActiveSubscription,
        storeAccountLabel,
        userId,
    ]);

    const handleSignOut = useCallback(async () => {
        if (isPending || isProcessing || isRestoringPurchases) {
            return;
        }

        try {
            setIsProcessing(true);
            await authClient.signOut();
            router.dismissTo("/");
        } catch {
            Alert.alert("Something went wrong", "Unable to sign out. Please try again.");
            setIsProcessing(false);
        }
    }, [isPending, isProcessing, isRestoringPurchases, router]);

    return (
        <View style={styles.container}>
            <SettingsButton
                text="Subscription"
                leftIcon={RepeatIcon}
                showChevron
                onPress={handleOpenSubscription}
            />
            <SettingsButton
                text={isRestoringPurchases ? "Restoring purchases..." : "Restore purchases"}
                leftIcon={RepeatIcon}
                loading={isRestoringPurchases}
                disabled={isRestorePurchasesDisabled}
                onPress={() => {
                    void handleRestorePurchases();
                }}
            />
            <SettingsButton
                text="Data controls"
                leftIcon={SettingsIcon}
                showChevron
                onPress={handleOpenDataControls}
            />
            <SettingsButton
                text={isProcessing ? "Logging out..." : "Log out"}
                background={false}
                leftIcon={LogOutIcon}
                loading={isProcessing}
                disabled={isPending || isProcessing || isRestoringPurchases}
                onPress={() => {
                    void handleSignOut();
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#f2f2f2",
        paddingTop: 24,
        paddingHorizontal: 16,
        gap: 12,
    },
});
