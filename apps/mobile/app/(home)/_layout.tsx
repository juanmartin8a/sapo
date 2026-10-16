import { Stack } from "expo-router";

import { APP_ROUTE_NAMES } from "@/constants/routes";
import { SETTINGS_COLORS } from "@/constants/settings";

const settingsModalBackground = SETTINGS_COLORS.screenBackground;

export const unstable_settings = {
    anchor: "index",
};

export default function HomeLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen
                name={APP_ROUTE_NAMES.SETTINGS_MODAL}
                options={{
                    presentation: "modal",
                    animation: "slide_from_bottom",
                    gestureEnabled: true,
                    contentStyle: { backgroundColor: settingsModalBackground },
                }}
            />
        </Stack>
    );
}
