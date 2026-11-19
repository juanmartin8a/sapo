import { useCallback } from "react";
import { Stack, useRouter } from "expo-router";
import { Platform } from "react-native";

import { APP_ROUTES, SETTINGS_ROUTES } from "@/constants/routes";
import { useAppTheme } from "@/providers/AppThemeProvider";

const isIOS = Platform.OS === "ios";

export default function SettingsModalLayout() {
    const { scheme, settingsColors } = useAppTheme();
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
                headerStyle: { backgroundColor: "transparent" },
                headerTintColor: scheme === 'dark' ? settingsColors.primaryText : undefined,
                headerLargeStyle: { backgroundColor: "transparent" },
                contentStyle: { backgroundColor: settingsColors.screenBackground },
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
                            tintColor={settingsColors.primaryText}
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
