import { ConvexReactClient } from "convex/react";
import { Stack } from "expo-router";
import * as WebBrowser from 'expo-web-browser';
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { authClient } from "@/lib/auth-client";
import AuthGate from "@/providers/AuthGate";
import RevenueCatIdentitySync from "@/providers/RevenueCatIdentitySync";

WebBrowser.maybeCompleteAuthSession();

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL as string, {
    unsavedChangesWarning: false,
});

export default function RootLayout() {
    return (
        <ConvexBetterAuthProvider client={convex} authClient={authClient}>
            <KeyboardProvider>
                <AuthGate />
                <RevenueCatIdentitySync />
                <Stack screenOptions={{ headerShown: false }} />
            </KeyboardProvider>
        </ConvexBetterAuthProvider>
    );
}
