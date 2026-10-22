import { useNavigate } from "@tanstack/solid-router";
import { onSettled, Show } from "solid-js";
import { useAppState } from "@/providers/AppProvider";
import Icon from "@/components/ui/Icon";

export default function TranslateButton() {
    const { translation, auth, pwa, basePath, inputLimit, respellLocked } = useAppState();
    const { busy, characterCount, operationLabel } = translation;
    const navigate = useNavigate();
    const actionLabel = () =>
        busy() ? "Stop" : translation.isRepeat() ? "Repeat" : operationLabel();
    const actionIcon = () =>
        translation.isRepeat() ? ("repeat" as const) : ("arrow-right" as const);

    function submit() {
        if (busy()) {
            translation.stopStream();
            return;
        }
        translation.setError(null);
        if (!pwa.state.online) {
            translation.setError("You’re offline. Connect to the internet to continue.");
            return;
        }
        if (auth.state.status === "checking") {
            translation.setError(
                "Your account is still being checked. Please try again in a moment.",
            );
            return;
        }
        if (auth.state.status !== "authenticated") {
            void navigate({ to: `${basePath}/auth/` });
            return;
        }
        if (auth.state.hasActiveSubscription === null) {
            translation.setError("Your plan is still being checked. Please try again in a moment.");
            return;
        }
        if (respellLocked()) {
            translation.setError(
                "Respelling is included with Polyglot. You can manage your plan in the SAPO mobile app.",
            );
            return;
        }
        if (characterCount() > inputLimit()) {
            translation.setError(
                `Please keep your text within ${inputLimit().toLocaleString()} characters.`,
            );
            return;
        }
        void translation.sendMessage(auth.state.userId!);
    }

    onSettled(() => {
        const shortcut = (event: KeyboardEvent) => {
            if (
                (event.metaKey || event.ctrlKey) &&
                event.key === "Enter" &&
                !document.querySelector("dialog[open], dialog:popover-open")
            ) {
                event.preventDefault();
                submit();
            }
        };
        window.addEventListener("keydown", shortcut);
        return () => window.removeEventListener("keydown", shortcut);
    });

    return (
        <button
            class="translate-button"
            onClick={submit}
            disabled={
                !busy() &&
                (!translation.state.input.trim() ||
                    auth.state.status === "checking" ||
                    !pwa.state.online)
            }
            aria-label={
                busy()
                    ? "Stop translation"
                    : translation.isRepeat()
                      ? "Repeat translation"
                      : translation.state.operation === "translate"
                        ? "Translate"
                        : "Respell"
            }
        >
            <span class="sr-only">{actionLabel()}</span>
            <Show when={busy()} fallback={<Icon name={actionIcon()} size={32} />}>
                <svg
                    class="icon"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    stroke="currentColor"
                    stroke-width="2"
                    aria-hidden="true"
                >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                </svg>
            </Show>
        </button>
    );
}
