import { Slot } from "expo-router";
import { ClerkProvider } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

export default function RootLayout() {
    return <ClerkProvider tokenCache={tokenCache}>
        <Slot />
    </ClerkProvider>
}
