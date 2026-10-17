import { createStore } from "solid-js";
import { ConvexClient, ConvexHttpClient } from "convex/browser";
import { api } from "@sapo/backend/api";
import {
    getAuthClient,
    getConvexAccessToken,
    isAuthConfigured,
} from "@/lib/auth-client";

import { exchangeSignInCallback } from "@/lib/auth-callback";

export function createAuthStore() {
    const [state, setState] = createStore({
        status: "checking" as "checking" | "authenticated" | "signed_out",
        userId: null as string | null,
        email: null as string | null,
        name: null as string | null,
        hasActiveSubscription: null as boolean | null,
        isActivating: false,
        accessExpiresAtMs: null as number | null,
        error: null as string | null,
    });
    let client: ConvexClient | null = null;
    let unsubscribe: (() => void) | null = null;
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    let generation = 0;
    let refreshPromise: Promise<void> | null = null;

    function clearSubscription() {
        unsubscribe?.();
        unsubscribe = null;
        if (expiryTimer) clearTimeout(expiryTimer);
        expiryTimer = null;
    }

    function reset() {
        clearSubscription();
        setState((draft) => {
            draft.status = "signed_out";
            draft.userId = null;
            draft.email = null;
            draft.name = null;
            draft.hasActiveSubscription = null;
            draft.isActivating = false;
            draft.accessExpiresAtMs = null;
        });
    }

    async function refreshSession() {
        if (refreshPromise) return refreshPromise;
        const run = ++generation;
        refreshPromise = (async () => {
            if (!isAuthConfigured || !import.meta.env.VITE_CONVEX_URL) {
                reset();
                return;
            }
            try {
                await exchangeSignInCallback(
                    window.location.href,
                    getAuthClient(),
                    (url) => {
                        window.history.replaceState(
                            window.history.state,
                            "",
                            url,
                        );
                    },
                );
                const { data: session, error } =
                    await getAuthClient().getSession();
                if (run !== generation) return;
                if (error)
                    throw new Error(
                        "Couldn’t verify your session. Please try again.",
                    );
                if (!session?.user) {
                    client?.setAuth(async () => null);
                    reset();
                    return;
                }
                const userId = session.user.id;
                clearSubscription();
                setState((draft) => {
                    draft.status = "checking";
                    draft.hasActiveSubscription = null;
                    draft.error = null;
                });
                client ??= new ConvexClient(import.meta.env.VITE_CONVEX_URL);
                const token = await getConvexAccessToken();
                if (run !== generation) return;
                client.setAuth(async () => getConvexAccessToken());
                // Validate through the same authoritative user endpoint as mobile.
                const httpClient = new ConvexHttpClient(
                    import.meta.env.VITE_CONVEX_URL,
                );
                httpClient.setAuth(token);
                const user = await httpClient.query(
                    api.auth.getCurrentUser,
                    {},
                );
                const confirmed = (await getAuthClient().getSession()).data;
                if (run !== generation) return;
                if (
                    !user ||
                    String(user._id) !== userId ||
                    confirmed?.user.id !== userId
                ) {
                    reset();
                    throw new Error(
                        "Please sign in again to verify this account.",
                    );
                }
                setState((draft) => {
                    draft.status = "authenticated";
                    draft.userId = userId;
                    draft.email = user.email;
                    draft.name = session.user.name;
                });
                unsubscribe = client.onUpdate(
                    api.subscription.getCurrentSubscriptionStatus,
                    { expected_user_id: userId },
                    (subscription) => {
                        if (run !== generation) return;
                        if (expiryTimer) clearTimeout(expiryTimer);
                        expiryTimer = null;
                        const active =
                            subscription?.has_active_subscription ?? null;
                        setState((draft) => {
                            draft.hasActiveSubscription = active;
                            draft.isActivating =
                                subscription?.status === "activating";
                            draft.accessExpiresAtMs =
                                subscription?.access_expires_at_ms ?? null;
                        });
                        if (
                            subscription?.access_expires_at_ms &&
                            subscription.access_expires_at_ms > Date.now()
                        ) {
                            const delay = Math.max(
                                0,
                                subscription.access_expires_at_ms - Date.now(),
                            );
                            expiryTimer = setTimeout(
                                () => {
                                    setState((draft) => {
                                        draft.hasActiveSubscription = null;
                                    });
                                    void refreshSession();
                                },
                                Math.min(delay + 100, 2_147_483_647),
                            );
                        }
                    },
                    () => {
                        if (run === generation)
                            setState((draft) => {
                                draft.hasActiveSubscription = null;
                                draft.error =
                                    "Couldn’t check your plan. Refresh to try again.";
                            });
                    },
                );
            } catch {
                if (run !== generation) return;
                clearSubscription();
                setState((draft) => {
                    draft.status = draft.userId ? "checking" : "signed_out";
                    draft.hasActiveSubscription = null;
                    draft.error =
                        "Couldn’t verify your session. Check your connection and try again.";
                });
            }
        })().finally(() => {
            refreshPromise = null;
        });
        return refreshPromise;
    }

    async function signOut() {
        ++generation;
        reset();
        client?.setAuth(async () => null);
        const { error } = await getAuthClient().signOut();
        if (error) {
            setState((draft) => {
                draft.error =
                    "Sign-out could not be completed. Please try again.";
            });
            throw new Error("Sign-out could not be completed.");
        }
    }

    return {
        state,
        refreshSession,
        signOut,
        dispose: () => {
            ++generation;
            clearSubscription();
            void client?.close();
            client = null;
        },
    };
}
