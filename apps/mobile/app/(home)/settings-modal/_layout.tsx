import { useCallback } from "react";
import { Stack, useRouter } from "expo-router";
import { Platform, StyleSheet } from "react-native";

import { APP_ROUTES, SETTINGS_ROUTES } from "@/constants/routes";
import { SETTINGS_COLORS } from "@/constants/settings";

const isIOS = Platform.OS === "ios";
const settingsModalBackground = SETTINGS_COLORS.screenBackground;

export default function SettingsModalLayout() {
    const router = useRouter();

    const handleDismiss = useCallback(() => {
        router.dismissTo(APP_ROUTES.HOME);
    }, [router]);

    return (
        <Stack
            screenOptions={{
                headerShown: true,
                headerTransparent: true,
                headerShadowVisible: isIOS,
                headerLargeTitleShadowVisible: false,
                headerStyle: styles.header,
                headerLargeStyle: styles.header,
                contentStyle: styles.content,
            }}
        >
            <Stack.Screen
                name={SETTINGS_ROUTES.ROOT.name}
                options={{
                    title: SETTINGS_ROUTES.ROOT.title,
                }}
            >
                {isIOS && (
                    <Stack.Toolbar placement="right">
                        <Stack.Toolbar.Button
                            accessibilityLabel="Close"
                            icon="xmark"
                            onPress={handleDismiss}
                            tintColor={SETTINGS_COLORS.primaryText}
                        />
                    </Stack.Toolbar>
                )}
            </Stack.Screen>
            <Stack.Screen
                name={SETTINGS_ROUTES.DATA_CONTROLS.name}
                options={{
                    title: SETTINGS_ROUTES.DATA_CONTROLS.title,
                    headerBackButtonDisplayMode: "minimal",
                    headerRight: () => null,
                }}
            />
            <Stack.Screen
                name={SETTINGS_ROUTES.LOCAL_MODELS.name}
                options={{
                    title: SETTINGS_ROUTES.LOCAL_MODELS.title,
                    headerBackButtonDisplayMode: "minimal",
                    headerRight: () => null,
                }}
            />
            <Stack.Screen
                name={SETTINGS_ROUTES.SUBSCRIPTION.name}
                options={{
                    title: SETTINGS_ROUTES.SUBSCRIPTION.title,
                    headerBackButtonDisplayMode: "minimal",
                    headerRight: () => null,
                }}
            />
        </Stack>
    );
}

const styles = StyleSheet.create({
    header: {
        backgroundColor: "transparent",
    },
    content: {
        backgroundColor: settingsModalBackground,
    },
});
