import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { expoClient } from '@better-auth/expo/client'
import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'

export const authClient = createAuthClient({
    baseURL: process.env.EXPO_PUBLIC_CONVEX_SITE_URL,
    plugins: [
        expoClient({
            scheme: Constants.expoConfig?.scheme as string,
            storagePrefix: Constants.expoConfig?.scheme as string,
            storage: SecureStore,
        }),
        convexClient(),
    ],
});

export async function getConvexAccessToken() {
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const { data: convexTokenData } = await authClient.convex.token();
        const convexToken = convexTokenData?.token ?? null;

        if (convexToken) {
            return convexToken;
        }

        if (attempt === 0) {
            await authClient.getSession();
        }
    }

    return null;
}

export async function getConvexAccessTokenWithUserId() {
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const { data: sessionData } = await authClient.getSession();
        const userId = sessionData?.user?.id ?? null;
        const { data: convexTokenData } = await authClient.convex.token();
        const convexToken = convexTokenData?.token ?? null;
        const { data: confirmedSessionData } = await authClient.getSession();
        const confirmedUserId = confirmedSessionData?.user?.id ?? null;

        if (convexToken && userId && userId === confirmedUserId) {
            return {
                token: convexToken,
                userId,
            };
        }

        if (attempt === 0) {
            await authClient.getSession();
        }
    }

    return null;
}
