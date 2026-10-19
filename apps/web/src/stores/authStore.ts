import { createStore } from "solid-js";
import { ConvexClient, ConvexHttpClient } from "convex/browser";
import { api } from "@sapo/backend/api";
import { getAuthClient, getConvexAccessToken, isAuthConfigured } from "@/lib/auth-client";

import { exchangeSignInCallback } from "@/lib/auth-callback";
import { readAccountPreview, type AccountPreview } from "@/lib/auth-preview";

export function createAuthStore() {
    const [state, setState] = createStore({
        status: "checking" as "checking" | "authenticated" | "signed_out",
        userId: null as string | null,
        email: null as string | null,
        name: null as string | null,
        accountPreview: null as AccountPreview | null,
        hasActiveSubscription: null as boolean | null,
        isActivating: false,
        accessExpiresAtMs: null as number | null,
        error: null as string | null,
    });
    let client: ConvexClient | null = null;
    let unsubscribe: (() => void) | null = null;
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    let generation = 0;
    let subscriptionGeneration = 0;
    let refreshPromise: Promise<void> | null = null;
    let previewTimer: ReturnType<typeof setTimeout> | null = null;
    let previewRestored = false;
    let signingOut = false;
    let disposed = false;

    function setAccountPreview(preview: AccountPreview | null) {
        if (previewTimer) clearTimeout(previewTimer);
        previewTimer = null;
        setState((draft) => {
            draft.accountPreview = preview;
        });
        if (preview) {
            previewTimer = setTimeout(
                () => setAccountPreview(null),
                Math.min(Math.max(0, preview.expiresAtMs - Date.now()), 2_147_483_647),
            );
        }
    }

    function clearSubscription() {
        ++subscriptionGeneration;
        unsubscribe?.();
        unsubscribe = null;
        if (expiryTimer) clearTimeout(expiryTimer);
        expiryTimer = null;
    }

    function reset(
        status: "checking" | "signed_out" = "signed_out",
        preview: AccountPreview | null = null,
    ) {
        clearSubscription();
        setAccountPreview(preview);
        client?.setAuth(async () => null);
        setState((draft) => {
            draft.status = status;
            draft.userId = null;
            draft.email = null;
            draft.name = null;
            draft.hasActiveSubscription = null;
            draft.isActivating = false;
            draft.accessExpiresAtMs = null;
            draft.error = null;
        });
    }

    async function refreshSession() {
        if (disposed || signingOut) return;
        if (refreshPromise) return refreshPromise;
        const run = ++generation;
        refreshPromise = (async () => {
            if (!isAuthConfigured || !import.meta.env.VITE_CONVEX_URL) {
                reset();
                return;
            }
            try {
                // Hydrate only after mounting, preserving SSR/hydration isolation.
                // OAuth may be switching accounts, so never show the old cache then.
                if (!previewRestored) {
                    previewRestored = true;
                    const params = new URL(window.location.href).searchParams;
                    if (!params.has("ott") && !params.has("error"))
                        setAccountPreview(readAccountPreview(getAuthClient()));
                }
                await exchangeSignInCallback(window.location.href, getAuthClient(), (url) => {
                    window.history.replaceState(window.history.state, "", url);
                });
                const { data: session, error } = await getAuthClient().getSession();
                if (run !== generation) return;
                if (error) {
                    if (error.status === 401 || error.status === 403) {
                        reset();
                        return;
                    }
                    throw new Error("Couldn’t verify your session. Please try again.");
                }
                if (!session?.user) {
                    reset();
                    return;
                }
                const userId = session.user.id;
                // Focus revalidation must not hide an already verified account or
                // tear down its live plan subscription. Clear identity on a switch.
                if (state.userId !== userId)
                    reset(
                        "checking",
                        state.accountPreview?.userId === userId ? state.accountPreview : null,
                    );
                setState((draft) => {
                    draft.error = null;
                });
                client ??= new ConvexClient(import.meta.env.VITE_CONVEX_URL);
                const token = await getConvexAccessToken();
                if (run !== generation) return;
                // Validate through the same authoritative user endpoint as mobile.
                const httpClient = new ConvexHttpClient(import.meta.env.VITE_CONVEX_URL);
                httpClient.setAuth(token);
                const user = await httpClient.query(api.auth.getCurrentUser, {});
                if (run !== generation) return;
                if (!user || String(user._id) !== userId) {
                    reset();
                    return;
                }
                const confirmation = await getAuthClient().getSession();
                if (run !== generation) return;
                if (confirmation.error) {
                    if (confirmation.error.status === 401 || confirmation.error.status === 403) {
                        reset();
                        return;
                    }
                    throw new Error("Couldn’t verify your session.");
                }
                if (confirmation.data?.user.id !== userId) {
                    reset();
                    throw new Error("Please sign in again to verify this account.");
                }
                setAccountPreview(null);
                setState((draft) => {
                    draft.status = "authenticated";
                    draft.userId = userId;
                    draft.email = user.email;
                    draft.name = session.user.name;
                });
                if (unsubscribe && state.hasActiveSubscription !== null) return;
                clearSubscription();
                client.setAuth(async () => getConvexAccessToken());
                const subscriptionRun = subscriptionGeneration;
                unsubscribe = client.onUpdate(
                    api.subscription.getCurrentSubscriptionStatus,
                    { expected_user_id: userId },
                    (subscription) => {
                        if (subscriptionRun !== subscriptionGeneration) return;
                        if (expiryTimer) clearTimeout(expiryTimer);
                        expiryTimer = null;
                        const active = subscription?.has_active_subscription ?? null;
                        setState((draft) => {
                            draft.hasActiveSubscription = active;
                            draft.isActivating = subscription?.status === "activating";
                            draft.accessExpiresAtMs = subscription?.access_expires_at_ms ?? null;
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
                        if (subscriptionRun === subscriptionGeneration)
                            setState((draft) => {
                                draft.hasActiveSubscription = null;
                                draft.error = "Couldn’t check your plan. Refresh to try again.";
                            });
                    },
                );
            } catch {
                if (run !== generation) return;
                setState((draft) => {
                    // A network failure does not establish that the user signed out.
                    // Keep a verified identity; initial failures remain unresolved.
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
        signingOut = true;
        previewRestored = true;
        ++generation;
        reset();
        try {
            const { error } = await getAuthClient().signOut();
            if (error) throw new Error("Sign-out could not be completed.");
        } catch (error) {
            setState((draft) => {
                draft.error = "Sign-out could not be completed. Please try again.";
            });
            throw error;
        } finally {
            signingOut = false;
        }
    }

    async function handleSessionChange() {
        if (disposed || signingOut) return;
        const run = ++generation;
        previewRestored = true;
        reset("checking");
        // Invalidate immediately and wait out any stale request before checking
        // again. Storage events can arrive between cookie and session-cache writes.
        await refreshPromise;
        if (run === generation) await refreshSession();
    }

    return {
        state,
        refreshSession,
        signOut,
        handleSessionChange,
        dispose: () => {
            disposed = true;
            ++generation;
            clearSubscription();
            if (previewTimer) clearTimeout(previewTimer);
            void client?.close();
            client = null;
        },
    };
}
