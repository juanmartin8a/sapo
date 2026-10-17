import { createFileRoute, Link } from "@tanstack/solid-router";
import { createSignal, onSettled, Show } from "solid-js";
import { getAuthClient } from "@/lib/auth-client";
import { useAppState } from "@/providers/AppProvider";

export const Route = createFileRoute("/delete-account")({
    component: DeleteAccountScreen,
});

function DeleteAccountScreen() {
    const { auth, translation } = useAppState();
    const [status, setStatus] = createSignal(
        "Check your email link to confirm account deletion.",
    );
    const [pending, setPending] = createSignal(false);
    const [confirmed, setConfirmed] = createSignal(false);
    const [token, setToken] = createSignal<string | null>(null);
    onSettled(() => {
        setToken(new URLSearchParams(window.location.search).get("token"));
    });
    async function confirm() {
        const value = token();
        if (!value || pending()) return;
        setPending(true);
        try {
            const result = await getAuthClient().deleteUser({ token: value });
            if (result.error)
                throw new Error(
                    "This link could not be verified. Request a new one in Settings.",
                );
            translation.clear();
            await auth.refreshSession();
            setConfirmed(true);
            setStatus("Your SAPO account has been deleted.");
            window.history.replaceState(window.history.state, "", "/app/delete-account");
        } catch (error) {
            setStatus(
                error instanceof Error
                    ? error.message
                    : "Couldn’t delete the account.",
            );
        } finally {
            setPending(false);
        }
    }
    return (
        <main class="account-screen">
            <div class="account-card">
                <h1>Delete account</h1>
                <p role="status">{status()}</p>
                <Show when={token() && !confirmed()}>
                    <p>
                        This permanently deletes your SAPO account and data
                        across all platforms. Store subscriptions must be
                        cancelled separately.
                    </p>
                    <button
                        class="button-danger"
                        disabled={pending()}
                        onClick={() => void confirm()}
                    >
                        {pending() ? "Deleting…" : "Confirm account deletion"}
                    </button>
                </Show>
                <Link class="back-link" to="/">
                    Back to SAPO
                </Link>
            </div>
        </main>
    );
}
