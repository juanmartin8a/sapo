import { Link } from "@tanstack/solid-router";
import { createSignal, onSettled, Show } from "solid-js";
import { getAuthClient, isAuthConfigured } from "@/lib/auth-client";
import { TERMS_OF_USE_URL, PRIVACY_POLICY_URL } from "@/constants/translation";
import Icon from "@/components/ui/Icon";

export default function AuthScreen() {
    const [pending, setPending] = createSignal<"google" | "apple" | null>(null);
    const [error, setError] = createSignal<string | null>(null);
    onSettled(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.has("error"))
            setError(
                "Sign-in was cancelled or couldn’t be completed. Please try again.",
            );
    });
    async function signIn(provider: "google" | "apple") {
        if (pending()) return;
        setError(null);
        setPending(provider);
        try {
            const result = await getAuthClient().signIn.social({
                provider,
                callbackURL: `${window.location.origin}/app/`,
                errorCallbackURL: `${window.location.origin}/auth`,
            });
            if (result.error)
                throw new Error(
                    result.error.message ||
                        "Couldn’t sign in. Please try again.",
                );
            if (!result.data?.url) setPending(null);
        } catch (error) {
            setError(
                error instanceof Error ? error.message : "Couldn’t sign in.",
            );
            setPending(null);
        }
    }
    return (
        <main class="account-screen auth-screen">
            <div class="account-card">
                <Link class="back-link" to="/">
                    <Icon name="arrow-left" size={24} />
                    <span>Back to SAPO</span>
                </Link>
                <div class="auth-hero">
                    <img
                        src="/app/images/sapo.png"
                        alt="SAPO frog"
                        width="112"
                        height="96"
                    />
                    <h1>{pending() ? "Signing in…" : "Sign in"}</h1>
                </div>
                <div class="auth-actions">
                    <button
                        class="social-button google-button"
                        disabled={Boolean(pending()) || !isAuthConfigured}
                        onClick={() => void signIn("google")}
                    >
                        <Icon name="google-g" size={21} />
                        {pending() === "google"
                            ? "Connecting…"
                            : "Sign in with Google"}
                    </button>
                    <button
                        class="social-button apple-button"
                        disabled={Boolean(pending()) || !isAuthConfigured}
                        onClick={() => void signIn("apple")}
                    >
                        <Icon name="apple-logo" size={21} />
                        {pending() === "apple"
                            ? "Connecting…"
                            : "Sign in with Apple"}
                    </button>
                    <Show when={!isAuthConfigured}>
                        <p class="muted" role="status">
                            Sign-in is unavailable right now. Please try again
                            later.
                        </p>
                    </Show>
                    <Show when={error()}>
                        <p class="error-message" role="alert">
                            {error()}
                        </p>
                    </Show>
                    <p class="legal-notice">
                        By continuing, you agree to our{" "}
                        <a
                            href={TERMS_OF_USE_URL}
                            target="_blank"
                            rel="noreferrer"
                        >
                            Terms of Use
                        </a>{" "}
                        and{" "}
                        <a
                            href={PRIVACY_POLICY_URL}
                            target="_blank"
                            rel="noreferrer"
                        >
                            Privacy Policy
                        </a>
                        .
                    </p>
                </div>
            </div>
        </main>
    );
}
