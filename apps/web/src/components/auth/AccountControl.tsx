import { Link } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { useAuthState } from "@/providers/AuthProvider";
import Icon from "@/components/ui/Icon";

export default function AccountControl(props: {
    class?: string;
    onNavigate?: () => void;
    showSubscription?: boolean;
}) {
    const auth = useAuthState();
    return (
        <Show
            when={auth.state.status === "authenticated"}
            fallback={
                <Show
                    when={auth.state.status === "signed_out"}
                    fallback={
                        <div class={`account-control ${props.class ?? ""}`} role="status">
                            <span
                                class={`account-avatar ${auth.state.accountPreview ? "" : "account-avatar-pending"}`}
                                aria-hidden="true"
                            >
                                {auth.state.accountPreview
                                    ? (auth.state.accountPreview.name?.slice(0, 1).toUpperCase() ??
                                      ":)")
                                    : ""}
                            </span>
                            <span class="account-details">
                                <Show
                                    when={auth.state.accountPreview || auth.state.error}
                                    fallback={
                                        <span class="account-placeholder" aria-hidden="true" />
                                    }
                                >
                                    {auth.state.accountPreview
                                        ? auth.state.accountPreview.name || "Your account"
                                        : "Account unavailable"}
                                </Show>
                                <Show when={props.showSubscription !== false || auth.state.error}>
                                    <span class="account-subtitle">
                                        <Show
                                            when={auth.state.error}
                                            fallback={
                                                <span
                                                    class="account-placeholder"
                                                    aria-hidden="true"
                                                />
                                            }
                                        >
                                            <Show when={auth.state.accountPreview}>
                                                Account unavailable
                                            </Show>
                                        </Show>
                                    </span>
                                </Show>
                                <Show when={!auth.state.error}>
                                    <span class="sr-only">Loading account</span>
                                </Show>
                                <Show when={auth.state.error}>
                                    <button
                                        class="text-button"
                                        onClick={() => void auth.refreshSession()}
                                    >
                                        Try again
                                    </button>
                                </Show>
                            </span>
                        </div>
                    }
                >
                    <Link
                        class={`account-control account-signin ${props.class ?? ""}`}
                        to="/app/auth/"
                        onClick={() => props.onNavigate?.()}
                    >
                        <Icon name="log-in" size={20} />
                        <span>Sign in</span>
                    </Link>
                </Show>
            }
        >
            <Link
                class={`account-control ${props.class ?? ""}`}
                to="/app/settings/"
                onClick={() => props.onNavigate?.()}
            >
                <span class="account-avatar">
                    {auth.state.name?.slice(0, 1).toUpperCase() ?? ":)"}
                </span>
                <span class="account-details">
                    {auth.state.name || "Your account"}
                    <Show when={props.showSubscription !== false}>
                        <span class="account-subtitle">
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
                    </Show>
                </span>
            </Link>
        </Show>
    );
}
