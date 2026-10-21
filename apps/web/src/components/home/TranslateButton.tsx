import { useNavigate } from "@tanstack/solid-router";
import { onSettled } from "solid-js";
import { useAppState } from "@/providers/AppProvider";
import { DEFAULT_SUBSCRIPTION_PLAN_LIMITS } from "@/constants/translation";

export default function TranslateButton() {
    const { translation, auth, pwa, basePath } = useAppState();
    const navigate = useNavigate();
    const busy = () =>
        translation.state.status === "loading" || translation.state.status === "streaming";
    const characterCount = () => Array.from(translation.state.input).length;
    const inputLimit = () => {
        const plan =
            DEFAULT_SUBSCRIPTION_PLAN_LIMITS[
                auth.state.hasActiveSubscription ? "polyglot" : "free"
            ];
        return translation.state.operation === "respell"
            ? plan.respell_input_char_limit
            : plan.translate_input_char_limit;
    };
    const locked = () =>
        translation.state.operation === "respell" && auth.state.hasActiveSubscription === false;
    const actionLabel = () =>
        busy()
            ? "Stop"
            : translation.isRepeat()
              ? "Repeat"
              : translation.state.operation === "translate"
                ? "Translate"
                : translation.state.translateThenRespell
                  ? "Translate & Respell"
                  : "Respell";
    const actionIcon = () =>
        busy()
            ? ("square" as const)
            : translation.isRepeat()
              ? ("repeat" as const)
              : ("arrow-right" as const);

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
        if (locked()) {
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
            <img
                class="icon"
                src={`/app/icons/${actionIcon()}.svg`}
                alt=""
                aria-hidden="true"
                width="32"
                height="32"
            />
        </button>
    );
}
