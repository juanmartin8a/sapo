import { useCallback } from "react";
import { Stack, useRouter } from "expo-router";
import { Platform, Pressable, StyleSheet } from "react-native";
import XIcon from "../../../assets/icons/x.svg";

const isIOS = Platform.OS === "ios";

export default function SettingsModalLayout() {
    const router = useRouter();

    const handleDismiss = useCallback(() => {
        router.dismissTo("/");
    }, [router]);

    const renderCloseButton = useCallback(() => {
        return (
            <Pressable
                onPress={handleDismiss}
                hitSlop={4}
                style={({ pressed }) => [styles.headerActionButton, pressed && styles.headerActionButtonPressed]}
            >
                <XIcon width={26} height={26} stroke="#1E3526" />
            </Pressable>
        );
    }, [handleDismiss]);

    return (
        <Stack
            screenOptions={{
                headerShown: true,
                headerShadowVisible: false,
                headerStyle: styles.header,
                headerTintColor: "#1E3526",
                headerRight: isIOS ? renderCloseButton : undefined,
            }}
        >
            <Stack.Screen
                name="index"
                options={{
                    title: "Settings",
                    contentStyle: { backgroundColor: "transparent" }
                }}
            />
            <Stack.Screen
                name="data-controls"
                options={{
                    title: "Data controls",
                    headerBackButtonDisplayMode: 'minimal',
                    headerRight: () => null,
                }}
            />
            <Stack.Screen
                name="subscription"
                options={{
                    title: "Subscription",
                    headerBackButtonDisplayMode: 'minimal',
                    headerRight: () => null,
                    // headerTintColor: "black"
                }}
            />
        </Stack>
    );
}

const styles = StyleSheet.create({
    header: {
        backgroundColor: "#E1ECDD",
    },
    headerActionButton: {
        width: 36,
        height: 36,
        borderWidth: 0,
        borderColor: "transparent",
        alignItems: "center",
        justifyContent: "center",
    },
    headerActionButtonPressed: {
        opacity: 0.7,
    },
});
