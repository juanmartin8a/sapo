import { Stack } from "expo-router";
import { ClerkProvider } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import * as WebBrowser from 'expo-web-browser';
import { KeyboardProvider } from "react-native-keyboard-controller";

WebBrowser.maybeCompleteAuthSession();

export default function RootLayout() {
    return (
        <ClerkProvider tokenCache={tokenCache}>
            <KeyboardProvider>
                <Stack screenOptions={{ headerShown: false }} />
            </KeyboardProvider>
        </ClerkProvider>
    );
}
