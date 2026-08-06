import { createAuthClient } from "better-auth/react";
import type { BetterAuthClientPlugin } from "better-auth/client";
import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { expoClient } from "@better-auth/expo/client";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

type AuthClient = ReturnType<
    typeof createAuthClient<{ plugins: [ReturnType<typeof convexClient>] }>
>;

function createNativeAuthClient(): AuthClient {
    return createAuthClient({
        baseURL: process.env.EXPO_PUBLIC_CONVEX_SITE_URL,
        plugins: [
            convexClient(),
            // @ts-expect-error @better-auth/expo 1.6.26 uses an incompatible BetterFetch generic.
            expoClient({
                scheme: Constants.expoConfig?.scheme as string,
                storagePrefix: Constants.expoConfig?.scheme as string,
                storage: SecureStore,
            }),
        ],
    }) as unknown as AuthClient;
}

function createWebAuthClient(): AuthClient {
    // crossDomainClient touches localStorage, so only construct it on web.
    const webAuthClientPlugin = crossDomainClient() as unknown as BetterAuthClientPlugin;

    return createAuthClient({
        baseURL: process.env.EXPO_PUBLIC_CONVEX_SITE_URL,
        plugins: [convexClient(), webAuthClientPlugin],
    }) as unknown as AuthClient;
}

export const authClient = Platform.OS === "web" ? createWebAuthClient() : createNativeAuthClient();

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
