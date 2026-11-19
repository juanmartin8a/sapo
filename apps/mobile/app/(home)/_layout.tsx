import { Stack } from "expo-router";

import { APP_ROUTE_NAMES } from "@/constants/routes";
import { useAppTheme } from "@/providers/AppThemeProvider";

export const unstable_settings = {
    anchor: "index",
};

export default function HomeLayout() {
    const { colors, settingsColors } = useAppTheme();
    return (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen
                name={APP_ROUTE_NAMES.SETTINGS_MODAL}
                options={{
                    presentation: "modal",
                    animation: "slide_from_bottom",
                    gestureEnabled: true,
                    contentStyle: { backgroundColor: settingsColors.screenBackground },
                }}
            />
        </Stack>
    );
}
