import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { expoClient } from '@better-auth/expo/client'
import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'

export const authClient = createAuthClient({
    baseURL: process.env.EXPO_PUBLIC_CONVEX_SITE_URL,
    plugins: [
        anonymousClient(),
        expoClient({
            scheme: Constants.expoConfig?.scheme as string,
            storagePrefix: Constants.expoConfig?.scheme as string,
            storage: SecureStore,
        }),
        convexClient(),
    ],
});

type AuthSession = (typeof authClient)["$Infer"]["Session"];

let anonymousSessionPromise: Promise<AuthSession> | null = null;

function readSessionData(result: unknown): AuthSession | null {
    if (typeof result !== "object" || result === null) {
        return null;
    }

    if ("data" in result) {
        const data = (result as { data?: unknown }).data;
        return typeof data === "object" && data !== null ? (data as AuthSession) : null;
    }

    return result as AuthSession;
}

async function getCurrentSession() {
    return readSessionData(await authClient.getSession());
}

export async function signInAnonymously() {
    const result = await authClient.signIn.anonymous();

    if (result.error) {
        throw new Error(result.error.message ?? "Anonymous sign-in failed");
    }

    return getCurrentSession();
}

export async function ensureAnonymousSession() {
    const session = await getCurrentSession();
    if (session) {
        return session;
    }

    if (!anonymousSessionPromise) {
        anonymousSessionPromise = (async () => {
            const nextSession = await signInAnonymously();

            if (!nextSession) {
                throw new Error("Anonymous sign-in completed without session data");
            }

            return nextSession;
        })().finally(() => {
            anonymousSessionPromise = null;
        });
    }

    return anonymousSessionPromise;
}

export function warmAnonymousSession() {
    return ensureAnonymousSession().catch((error) => {
        if (__DEV__) {
            console.warn("Anonymous session warm-up failed", error);
        }

        return null;
    });
}

export async function getConvexAccessToken(options?: {
    ensureAnonymousSession?: boolean;
}) {
    if (options?.ensureAnonymousSession) {
        await ensureAnonymousSession();
    }

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
