import { ConvexReactClient } from "convex/react";
import AppThemeProvider, { useAppTheme } from "@/providers/AppThemeProvider";
import { Stack } from "expo-router";
import * as WebBrowser from 'expo-web-browser';
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { authClient } from "@/lib/auth-client";
import AuthGate from "@/providers/AuthGate";
import AuthStateProvider from "@/providers/AuthStateProvider";
import RevenueCatIdentitySync from "@/providers/RevenueCatIdentitySync";
import AppFontsProvider from "@/providers/AppFontsProvider";

WebBrowser.maybeCompleteAuthSession();

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL as string, {
    unsavedChangesWarning: false,
});

function AppStack() {
    const { colors } = useAppTheme();
    return (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen
                name="demo-access"
                options={{
                    presentation: "formSheet",
                    sheetAllowedDetents: "fitToContents",
                    sheetGrabberVisible: true,
                    sheetCornerRadius: 28,
                    contentStyle: { backgroundColor: colors.background },
                }}
            />
        </Stack>
    );
}

export default function RootLayout() {
    return (
        <AppFontsProvider>
            <AppThemeProvider>
                <ConvexBetterAuthProvider client={convex} authClient={authClient}>
                    <AuthStateProvider>
                        <KeyboardProvider>
                            <AuthGate />
                            <RevenueCatIdentitySync />
                            <AppStack />
                        </KeyboardProvider>
                    </AuthStateProvider>
                </ConvexBetterAuthProvider>
            </AppThemeProvider>
        </AppFontsProvider>
    );
}
