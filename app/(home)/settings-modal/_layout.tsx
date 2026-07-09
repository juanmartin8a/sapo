import { useCallback } from "react";
import { Stack, useRouter } from "expo-router";
import { Platform, Pressable, StyleSheet } from "react-native";
import XIcon from "../../../assets/icons/x.svg";

const isIOS = Platform.OS === "ios";
const settingsModalBackground = "#E1ECDD";

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
                headerStyle: styles.header,
                contentStyle: styles.content,
                headerTransparent: true,
                headerShadowVisible: true,
                headerRight: isIOS ? renderCloseButton : undefined,
            }}
        >
            <Stack.Screen
                name="index"
                options={{
                    title: "Settings",
                }}
            />
            <Stack.Screen
                name="data-controls"
                options={{
                    title: "Data controls",
                    headerBackButtonDisplayMode: 'minimal',
                    headerTransparent: true,
                    headerShadowVisible: true,
                    headerRight: () => null,
                }}
            />
            <Stack.Screen
                name="local-models"
                options={{
                    title: "Local models",
                    headerBackButtonDisplayMode: 'minimal',
                    headerTransparent: true,
                    headerShadowVisible: true,
                    headerRight: () => null,
                }}
            />
            <Stack.Screen
                name="subscription"
                options={{
                    title: "Subscription",
                    headerBackButtonDisplayMode: 'minimal',
                    headerTransparent: true,
                    headerShadowVisible: true,
                    headerRight: () => null,
                }}
            />
        </Stack>
    );
}

const styles = StyleSheet.create({
    header: {
        // backgroundColor: settingsModalBackground,
        backgroundColor: "transparent",
    },
    content: {
        backgroundColor: settingsModalBackground,
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
