import { ClerkProvider } from "@clerk/clerk-expo";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Stack } from "expo-router";
import * as WebBrowser from 'expo-web-browser';
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { authClient } from "@/clients/auth-client";

WebBrowser.maybeCompleteAuthSession();

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL as string, {
    // Optionally pause queries until the user is authenticated
    expectAuth: true,
    unsavedChangesWarning: false,
});


export default function RootLayout() {
    return (
        <ClerkProvider>
            <ConvexBetterAuthProvider client={convex} authClient={authClient}>
                <KeyboardProvider>
                    <Stack screenOptions={{ headerShown: false }} />
                </KeyboardProvider>
            </ConvexBetterAuthProvider>
        </ClerkProvider>
    );
}
