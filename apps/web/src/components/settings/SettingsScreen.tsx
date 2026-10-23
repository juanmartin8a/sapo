import { Link, useNavigate } from "@tanstack/solid-router";
import { createSignal, Show } from "solid-js";
import { deleteAccountPath } from "@/lib/translator-paths";
import { useAppState } from "@/providers/AppProvider";
import { TERMS_OF_USE_URL, PRIVACY_POLICY_URL } from "@/constants/translation";
import { getAuthClient } from "@/lib/auth-client";
import Icon from "@/components/ui/Icon";
import Dialog from "@/components/ui/Dialog";

export default function SettingsScreen() {
    const { auth, translation, pwa, isPwa, basePath, plan } = useAppState();
    const navigate = useNavigate();
    const [deleting, setDeleting] = createSignal(false);
    const [pending, setPending] = createSignal(false);
    const [message, setMessage] = createSignal<string | null>(null);
    const [error, setError] = createSignal<string | null>(null);
    async function signOut() {
        setPending(true);
        setError(null);
        try {
            translation.clear();
            await auth.signOut();
            await navigate({ to: `${basePath}/` });
        } catch {
            setError("Couldn’t sign out. Please try again.");
        } finally {
            setPending(false);
        }
    }
    async function requestDeletion() {
        if (pending()) return;
        const expectedId = auth.state.userId;
        setPending(true);
        setError(null);
        try {
            const client = getAuthClient();
            const session = await client.getSession();
            if (!expectedId || session.data?.user.id !== expectedId)
                throw new Error("Your account changed. Please reload and try again.");
            const result = await client.deleteUser({
                callbackURL: `${window.location.origin}${deleteAccountPath(basePath)}`,
            });
            if (result.error)
                throw new Error("Couldn’t request account deletion. Please try again.");
            setDeleting(false);
            setMessage("Check your email to confirm account deletion.");
        } catch (error) {
            setError(error instanceof Error ? error.message : "Couldn’t delete your account.");
        } finally {
            setPending(false);
        }
    }
    return (
        <main class="account-screen settings-screen">
            <div class="account-card settings-card">
                <Link class="back-link" to={`${basePath}/`}>
                    <Icon name="arrow-left" size={24} />
                    <span>Back to SAPO</span>
                </Link>
                <header class="settings-heading">
                    <h1>Settings</h1>
                </header>
                <section class="settings-section">
                    <h2>Account</h2>
                    <Show
                        when={auth.state.status === "authenticated"}
                        fallback={
                            <Show
                                when={auth.state.status === "signed_out"}
                                fallback={
                                    <div class="settings-row" role="status">
                                        <span>
                                            <Show
                                                when={auth.state.accountPreview || auth.state.error}
                                                fallback={
                                                    <span
                                                        class="account-placeholder"
                                                        aria-hidden="true"
                                                    />
                                                }
                                            >
                                                {auth.state.accountPreview
                                                    ? auth.state.accountPreview.name ||
                                                      "Your account"
                                                    : "Account unavailable"}
                                            </Show>
                                            <Show
                                                when={auth.state.accountPreview && auth.state.error}
                                            >
                                                <small>Account unavailable</small>
                                            </Show>
                                        </span>
                                        <Show when={!auth.state.error}>
                                            <span class="plan-badge">
                                                <span
                                                    class="account-placeholder"
                                                    aria-hidden="true"
                                                />
                                                <span class="sr-only">Loading account</span>
                                            </span>
                                        </Show>
                                        <Show when={auth.state.error}>
                                            <button
                                                class="text-button"
                                                onClick={() => void auth.refreshSession()}
                                            >
                                                Try again
                                            </button>
                                        </Show>
                                    </div>
                                }
                            >
                                <Link class="settings-row" to={`${basePath}/auth/`}>
                                    <span>Sign in</span>
                                    <Icon name="chevron-right" />
                                </Link>
                            </Show>
                        }
                    >
                        <div class="settings-row">
                            <span>
                                {auth.state.name || "Your account"}
                                <small>{auth.state.email}</small>
                            </span>
                            <span class="plan-badge">
                                <Show
                                    when={auth.state.hasActiveSubscription !== null}
                                    fallback={
                                        <>
                                            <span class="account-placeholder" aria-hidden="true" />
                                            <span class="sr-only">Loading plan</span>
                                        </>
                                    }
                                >
                                    {auth.state.hasActiveSubscription ? "Polyglot" : "Free"}
                                </Show>
                            </span>
                        </div>
                        <div class="plan-details">
                            <Show when={auth.state.hasActiveSubscription !== null}>
                                <p class="muted">
                                    {plan().translate_monthly_char_limit.toLocaleString()}{" "}
                                    translation characters per month
                                    <Show when={auth.state.hasActiveSubscription}>
                                        {" and "}
                                        {plan().respell_monthly_char_limit.toLocaleString()}{" "}
                                        respelling characters per month
                                    </Show>
                                    .
                                </p>
                            </Show>
                            <p class="muted">Manage purchases in the SAPO mobile app.</p>
                            <button
                                class="text-button"
                                disabled={pending() || auth.state.status === "checking"}
                                onClick={() => void auth.refreshSession()}
                            >
                                Refresh plan
                            </button>
                        </div>
                    </Show>
                </section>
                <Show when={isPwa}>
                    <section class="settings-section">
                        <h2>On your device</h2>
                        <Show
                            when={pwa.state.installable}
                            fallback={
                                <p class="settings-note muted">
                                    {pwa.state.installed
                                        ? "SAPO is installed on this device."
                                        : "Add SAPO to your home screen from your browser’s Share or menu options."}
                                </p>
                            }
                        >
                            <button class="settings-row" onClick={() => void pwa.install()}>
                                <span>Install SAPO</span>
                                <span aria-hidden="true">↗</span>
                            </button>
                        </Show>
                        <p class="settings-note muted">
                            Translation and respelling require an internet connection.
                        </p>
                    </section>
                </Show>
                <section class="settings-section settings-privacy-section">
                    <h2>Privacy & data</h2>
                    <p class="settings-note muted">
                        Only your language and layout preferences are saved on this device. Input
                        and output aren’t saved between visits.
                    </p>
                    <a
                        class="settings-row"
                        href={PRIVACY_POLICY_URL}
                        target="_blank"
                        rel="noreferrer"
                    >
                        <span>Privacy policy</span>
                        <span aria-hidden="true">↗</span>
                    </a>
                    <a
                        class="settings-row"
                        href={TERMS_OF_USE_URL}
                        target="_blank"
                        rel="noreferrer"
                    >
                        <span>Terms of use</span>
                        <span aria-hidden="true">↗</span>
                    </a>
                    <Show when={auth.state.status === "authenticated"}>
                        <button
                            class="settings-row danger"
                            disabled={pending()}
                            onClick={() => setDeleting(true)}
                        >
                            <span>Delete account</span>
                            <Icon name="trash" size={18} />
                        </button>
                    </Show>
                </section>
                <Show when={auth.state.status === "authenticated"}>
                    <button
                        class="settings-row signout-row"
                        disabled={pending()}
                        onClick={() => void signOut()}
                    >
                        <span>{pending() ? "Please wait…" : "Sign out"}</span>
                        <Icon name="log-out" size={18} />
                    </button>
                </Show>
                <Show when={message()}>
                    <p class="status-message" role="status">
                        {message()}
                    </p>
                </Show>
                <Show when={error()}>
                    <p class="error-message" role="alert">
                        {error()}
                    </p>
                </Show>
                <Show when={deleting()}>
                    <Dialog
                        title="Delete your account?"
                        class="delete-account-dialog"
                        onClose={() => {
                            if (!pending()) setDeleting(false);
                        }}
                    >
                        <div class="confirmation-content">
                            <p>
                                This permanently deletes your SAPO account and data on all
                                platforms.
                            </p>
                            <p class="muted">
                                Deleting your account does not cancel an App Store or Google Play
                                subscription. Cancel store billing separately.
                            </p>
                            <Show when={error()}>
                                <p class="error-message" role="alert">
                                    {error()}
                                </p>
                            </Show>
                            <div class="confirmation-actions">
                                <button
                                    class="button-secondary"
                                    disabled={pending()}
                                    onClick={() => setDeleting(false)}
                                >
                                    Keep account
                                </button>
                                <button
                                    class="button-danger"
                                    disabled={pending()}
                                    onClick={() => void requestDeletion()}
                                >
                                    {pending() ? "Please wait…" : "Continue"}
                                </button>
                            </div>
                        </div>
                    </Dialog>
                </Show>
            </div>
        </main>
    );
}
