import { useCallback } from "react";
import { Stack, useRouter } from "expo-router";
import { Platform, Pressable, StyleSheet } from "react-native";

import XIcon from "@/assets/icons/x.svg";
import { APP_ROUTES, SETTINGS_ROUTES } from "@/constants/routes";
import { SETTINGS_COLORS } from "@/constants/settings";

const isIOS = Platform.OS === "ios";
const settingsModalBackground = SETTINGS_COLORS.screenBackground;

export default function SettingsModalLayout() {
    const router = useRouter();

    const handleDismiss = useCallback(() => {
        router.dismissTo(APP_ROUTES.HOME);
    }, [router]);

    const renderCloseButton = useCallback(() => {
        return (
            <Pressable
                onPress={handleDismiss}
                hitSlop={4}
                style={({ pressed }) => [styles.headerActionButton, pressed && styles.headerActionButtonPressed]}
            >
                <XIcon width={26} height={26} stroke={SETTINGS_COLORS.primaryText} />
            </Pressable>
        );
    }, [handleDismiss]);

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
                headerRight: isIOS ? renderCloseButton : undefined,
            }}
        >
            <Stack.Screen
                name={SETTINGS_ROUTES.ROOT.name}
                options={{
                    title: SETTINGS_ROUTES.ROOT.title,
                }}
            />
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
