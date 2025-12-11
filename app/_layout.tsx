import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Stack } from "expo-router";
import { ClerkProvider } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import * as WebBrowser from 'expo-web-browser';
import { KeyboardProvider } from "react-native-keyboard-controller";

WebBrowser.maybeCompleteAuthSession();

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
    unsavedChangesWarning: false,
});

export default function RootLayout() {
    return (
        // <ClerkProvider tokenCache={tokenCache}>
        <ConvexProvider client={convex}>
            <KeyboardProvider>
                <Stack screenOptions={{ headerShown: false }} />
            </KeyboardProvider>
        </ConvexProvider>
    );
}
