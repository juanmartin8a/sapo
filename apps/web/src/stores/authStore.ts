import { createStore } from "solid-js";
import { ConvexClient, ConvexHttpClient } from "convex/browser";
import { api } from "@sapo/backend/api";
import {
    clearConvexAccessToken,
    getAuthClient,
    getConvexAccessToken,
    isAuthConfigured,
} from "@/lib/auth-client";
import { clearLegacyAuth, migrateLegacySession, readLegacyAccountPreview } from "@/lib/auth-legacy";
import type { AccountPreview } from "@/lib/auth-preview";
import { AUTH_REFRESH_INTERVAL_MS, type AuthBootstrap } from "../lib/auth-bootstrap";

function sessionRejected(error: unknown) {
    return (
        error &&
        typeof error === "object" &&
        "status" in error &&
        (error.status === 401 || error.status === 403)
    );
}

export function createAuthStore(initialAuth?: AuthBootstrap) {
    const [state, setState] = createStore({
        status: initialAuth?.status ?? ("checking" as "checking" | "authenticated" | "signed_out"),
        userId: initialAuth?.account?.userId ?? (null as string | null),
        email: initialAuth?.account?.email ?? (null as string | null),
        name: initialAuth?.account?.name ?? (null as string | null),
        accountPreview: null as AccountPreview | null,
        hasActiveSubscription: null as boolean | null,
        error: null as string | null,
        sessionRevision: 0,
    });
    let client: ConvexClient | null = null;
    let unsubscribe: (() => void) | null = null;
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    let generation = 0;
    let subscriptionGeneration = 0;
    let refreshPromise: Promise<void> | null = null;
    let previewTimer: ReturnType<typeof setTimeout> | null = null;
    let previewRestored = initialAuth !== undefined;
    let signingOut = false;
    let disposed = false;
    let initialized: Promise<void> | null = null;
    let initializing = false;
    let lastVerifiedAtMs: number | null = null;

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
        if (status === "signed_out") lastVerifiedAtMs = Date.now();
        clearSubscription();
        setAccountPreview(preview);
        client?.setAuth(async () => null);
        setState((draft) => {
            draft.status = status;
            draft.userId = null;
            draft.email = null;
            draft.name = null;
            draft.hasActiveSubscription = null;
            draft.error = null;
        });
    }

    function subscribeToPlan(userId: string) {
        client ??= new ConvexClient(import.meta.env.VITE_CONVEX_URL);
        if (unsubscribe && state.hasActiveSubscription !== null) return;
        clearSubscription();
        client.setAuth(async ({ forceRefreshToken }) => getConvexAccessToken(forceRefreshToken));
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
                });
                if (
                    subscription?.access_expires_at_ms &&
                    subscription.access_expires_at_ms > Date.now()
                ) {
                    const delay = Math.max(0, subscription.access_expires_at_ms - Date.now());
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
                        setAccountPreview(readLegacyAccountPreview());
                }
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
                setState((draft) => {
                    draft.status = "authenticated";
                    draft.userId = userId;
                    draft.email = user.email;
                    draft.name = session.user.name;
                });
                setAccountPreview(null);
                lastVerifiedAtMs = Date.now();
                subscribeToPlan(userId);
            } catch (error) {
                if (run !== generation) return;
                if (sessionRejected(error)) {
                    reset();
                    return;
                }
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
        clearConvexAccessToken();
        clearLegacyAuth();
        reset();
        try {
            // Let earlier Set-Cookie responses finish before clearing the session.
            await initialized;
            await refreshPromise;
            const { error } = await getAuthClient().signOut();
            if (error) throw new Error("Sign-out could not be completed.");
            // Notify again after cookies are cleared, superseding checks that
            // another tab may have started while sign-out was still pending.
            setState((draft) => {
                ++draft.sessionRevision;
            });
        } catch (error) {
            setState((draft) => {
                draft.error = "Sign-out could not be completed. Please try again.";
            });
            throw error;
        } finally {
            signingOut = false;
        }
    }

    async function handleSessionChange(userId?: string | null) {
        if (disposed || signingOut) return;
        const run = ++generation;
        previewRestored = true;
        clearConvexAccessToken();
        reset(userId === null ? "signed_out" : "checking");
        // Invalidate immediately and wait out any stale request before checking
        // again. Storage events can arrive between cookie and session-cache writes.
        await refreshPromise;
        if (run === generation) await refreshSession();
    }

    function initialize() {
        if (disposed || signingOut) return Promise.resolve();
        return (initialized ??= (async () => {
            initializing = true;
            let run = generation;
            try {
                const migrated = await migrateLegacySession();
                if (disposed || signingOut) return;
                if (!migrated && initialAuth?.status === "signed_out") {
                    lastVerifiedAtMs = Date.now();
                    return;
                }
                await refreshPromise;
                if (!migrated && initialAuth?.account && state.status === "authenticated") {
                    // SSR already verified the cached identity. Connect to Convex
                    // once; do not repeat the full session handshake on each reload.
                    run = ++generation;
                    const token = await getConvexAccessToken();
                    if (run !== generation) return;
                    const httpClient = new ConvexHttpClient(import.meta.env.VITE_CONVEX_URL);
                    httpClient.setAuth(token);
                    const user = await httpClient.query(api.auth.getCurrentUser, {});
                    if (run !== generation) return;
                    if (!user) {
                        reset();
                        return;
                    }
                    if (String(user._id) === state.userId) {
                        lastVerifiedAtMs = Date.now();
                        subscribeToPlan(state.userId!);
                        return;
                    }
                    clearConvexAccessToken();
                }
                await refreshSession();
            } catch (error) {
                if (run !== generation) return;
                if (sessionRejected(error)) {
                    reset();
                    return;
                }
                if (!disposed && !signingOut)
                    setState((draft) => {
                        draft.error = "Couldn’t restore your session. Please try again.";
                    });
            } finally {
                initializing = false;
            }
        })());
    }

    function refreshIfStale() {
        if (initializing) return initialized ?? Promise.resolve();
        if (lastVerifiedAtMs !== null && Date.now() - lastVerifiedAtMs < AUTH_REFRESH_INTERVAL_MS)
            return Promise.resolve();
        return refreshSession();
    }

    return {
        state,
        initialize,
        refreshIfStale,
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
