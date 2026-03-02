import { useCallback, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import TrashIcon from "@/assets/icons/trash.svg";
import { authClient } from "@/clients/auth-client";
import SettingsButton from "@/components/settings-modal/SettingsButton";

export default function DataControlsScreen() {
    const { data: session, isPending } = authClient.useSession();
    const user = session?.user;
    const [isProcessing, setIsProcessing] = useState(false);

    const handleDeleteAccount = useCallback(() => {
        if (isPending || !user || isProcessing) {
            return;
        }

        Alert.alert(
            "Delete account",
            "This action will permanently remove your account and data. Continue?",
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
                        } catch {
                            setIsProcessing(false);
                            Alert.alert("Something went wrong", "Unable to delete the account. Please try again.");
                        }
                    },
                },
            ]
        );
    }, [isPending, isProcessing, user]);

    return (
        <View style={styles.container}>
            <SettingsButton
                text={isProcessing ? "Deleting account..." : "Delete account"}
                leftIcon={TrashIcon}
                backgroundColor="#CDDEC8"
                borderRadius={22}
                textColor="#8B332A"
                iconColor="#8B332A"
                loading={isProcessing}
                disabled={isPending || isProcessing || !user}
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
