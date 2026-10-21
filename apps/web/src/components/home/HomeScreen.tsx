import { Link, useNavigate } from "@tanstack/solid-router";
import { createMemo, createSignal, onSettled, Show } from "solid-js";
import { useAppState } from "@/providers/AppProvider";
import {
    DEFAULT_SUBSCRIPTION_PLAN_LIMITS,
    languages,
    languagesPlusAutoDetect,
} from "@/constants/translation";
import Sidebar from "@/components/sidebar/Sidebar";
import Dialog from "@/components/ui/Dialog";
import Icon from "@/components/ui/Icon";
import LanguageSelector from "@/components/ui/LanguageSelector";
import TranslationOutput from "./TranslationOutput";
import HomePager from "./HomePager";

export default function HomeScreen() {
    const { translation, auth, pwa, isPwa, basePath } = useAppState();
    const navigate = useNavigate();
    const [drawerOpen, setDrawerOpen] = createSignal(false);
    const [wideScreen, setWideScreen] = createSignal(false);
    const [notice, setNotice] = createSignal<string | null>(null);
    const busy = () =>
        translation.state.status === "loading" || translation.state.status === "streaming";
    const combinedMode = () =>
        translation.state.operation === "respell" && translation.state.translateThenRespell;
    const desktopOutput = () => wideScreen() && !isPwa;
    const splitOutput = () =>
        desktopOutput() && (combinedMode() || Boolean(translation.state.translationPreview));
    const characterCount = createMemo(() => Array.from(translation.state.input).length);
    const plan = () =>
        DEFAULT_SUBSCRIPTION_PLAN_LIMITS[auth.state.hasActiveSubscription ? "polyglot" : "free"];
    const inputLimit = () =>
        translation.state.operation === "respell"
            ? plan().respell_input_char_limit
            : plan().translate_input_char_limit;
    const locked = () =>
        translation.state.operation === "respell" && auth.state.hasActiveSubscription === false;
    const operationLabel = () =>
        translation.state.operation === "translate"
            ? "Translate"
            : translation.state.translateThenRespell
              ? "Translate & Respell"
              : "Respell";
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
    const footerMessage = () =>
        translation.state.error ||
        auth.state.error ||
        (locked() ? "Respelling is a Polyglot feature." : "");

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
        const media = window.matchMedia("(min-width: 900px)");
        const resize = () => {
            setWideScreen(media.matches);
        };
        resize();
        media.addEventListener("change", resize);
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
        return () => {
            window.removeEventListener("keydown", shortcut);
            media.removeEventListener("change", resize);
        };
    });

    async function copyOutput(text = translation.state.displayText) {
        try {
            await navigator.clipboard.writeText(text);
            setNotice("Copied to clipboard.");
        } catch {
            setNotice("Couldn’t copy. You can select the text and copy it manually.");
        }
        setTimeout(() => setNotice(null), 3000);
    }

    const TranslationAction = () => (
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

    return (
        <div class="app-shell">
            <a class="skip-link" href="#translation-input">
                Skip to input
            </a>
            <Show when={isPwa}>
                <header class="app-header">
                    <div class="header-left">
                        <button
                            class="icon-button"
                            aria-label="Toggle sidebar"
                            aria-expanded={drawerOpen() ? "true" : "false"}
                            onClick={() => setDrawerOpen(true)}
                        >
                            <Icon name="sidebar" size={40} />
                        </button>
                    </div>
                    <Link class="wordmark" to={`${basePath}/`} aria-label="SAPO home">
                        S A P O
                    </Link>
                    <div class="header-right">
                        <TranslationAction />
                    </div>
                </header>
            </Show>
            <Show when={!pwa.state.online}>
                <div class="connection-banner" role="status">
                    You’re offline. Translation needs an internet connection.
                </div>
            </Show>
            <Show when={pwa.state.updateAvailable}>
                <div class="connection-banner">
                    An update is available.
                    <button class="text-button" onClick={() => pwa.update()}>
                        Update now
                    </button>
                </div>
            </Show>
            <div class="app-body">
                <Show when={!isPwa}>
                    <div class="desktop-options">
                        <div class="desktop-toolbar">
                            <nav aria-label="Translation options">
                                <Sidebar layout="panel" action={TranslationAction} />
                            </nav>
                        </div>
                    </div>
                </Show>
                <main
                    class={`workspace ${isPwa && translation.state.singleScreen ? "mobile-single-screen" : ""} ${translation.state.mobilePane === "output" ? "show-output" : "show-input"}`}
                >
                    <header class="workspace-header">
                        <h1>{operationLabel()}</h1>
                    </header>
                    <Show when={isPwa}>
                        <div class="mobile-tabs" role="group" aria-label="Workspace view">
                            <button
                                aria-pressed={
                                    translation.state.mobilePane === "input" ? "true" : "false"
                                }
                                onClick={() => translation.setMobilePane("input")}
                            >
                                Input
                            </button>
                            <button
                                aria-pressed={
                                    translation.state.mobilePane === "output" ? "true" : "false"
                                }
                                onClick={() => translation.setMobilePane("output")}
                            >
                                Output
                                <Show when={busy()}>
                                    <span class="status-dot" />
                                </Show>
                            </button>
                        </div>
                    </Show>
                    <HomePager>
                        <section
                            class="input-pane"
                            aria-label="Input"
                            inert={
                                isPwa &&
                                !translation.state.singleScreen &&
                                translation.state.mobilePane !== "input"
                            }
                        >
                            <div class="pane-toolbar">
                                <LanguageSelector
                                    label="Source language"
                                    caption={desktopOutput() ? "Source" : undefined}
                                    options={Object.values(languagesPlusAutoDetect)}
                                    value={translation.state.sourceLanguage}
                                    onChange={(sourceLanguage) =>
                                        translation.setPreferences({
                                            sourceLanguage,
                                        })
                                    }
                                    disabled={busy()}
                                />
                            </div>
                            <label class="sr-only" for="translation-input">
                                Text to {translation.state.operation}
                            </label>
                            <textarea
                                id="translation-input"
                                class="translation-input"
                                placeholder="Enter text…"
                                value={translation.state.input}
                                dir="auto"
                                spellcheck={false}
                                onInput={(event) => translation.setInput(event.currentTarget.value)}
                            />
                            <div class="pane-bottom">
                                <span
                                    class={`character-count ${characterCount() > inputLimit() && inputLimit() > 0 ? "over-limit" : ""}`}
                                >
                                    {characterCount().toLocaleString()}
                                    <Show when={inputLimit() > 0}>
                                        {" "}
                                        / {inputLimit().toLocaleString()}
                                    </Show>
                                    <span class="character-unit"> characters</span>
                                </span>
                                <span class="keyboard-hint desktop-only">⌘ / Ctrl + Enter</span>
                            </div>
                        </section>
                        <Show when={!desktopOutput() || !combinedMode()}>
                            <button
                                class="swap-button"
                                aria-label="Swap source and target languages"
                                disabled={
                                    busy() ||
                                    (!desktopOutput() &&
                                        translation.state.operation === "respell" &&
                                        !translation.state.translateThenRespell)
                                }
                                onClick={() => translation.swapLanguages()}
                            >
                                <Icon name="arrow-right-left" size={20} />
                            </button>
                        </Show>
                        <section
                            class={`output-pane ${splitOutput() ? "output-pane-split" : ""}`}
                            aria-label="Output"
                            inert={
                                isPwa &&
                                !translation.state.singleScreen &&
                                translation.state.mobilePane !== "output"
                            }
                            aria-busy={busy() ? "true" : "false"}
                        >
                            <div class="pane-toolbar">
                                <LanguageSelector
                                    label="Target language"
                                    caption={desktopOutput() ? "Target" : undefined}
                                    options={Object.values(languages)}
                                    value={translation.state.targetLanguage}
                                    onChange={(targetLanguage) =>
                                        translation.setPreferences({
                                            targetLanguage,
                                        })
                                    }
                                    disabled={busy()}
                                />
                                <button
                                    class="icon-button copy-button"
                                    aria-label={splitOutput() ? "Copy translation" : "Copy output"}
                                    disabled={
                                        splitOutput()
                                            ? !translation.state.translationPreview
                                            : !translation.state.displayText
                                    }
                                    onClick={() =>
                                        void copyOutput(
                                            splitOutput()
                                                ? translation.state.translationPreview
                                                : translation.state.displayText,
                                        )
                                    }
                                >
                                    <Icon name="copy" size={20} />
                                </button>
                            </div>
                            <TranslationOutput
                                split={splitOutput()}
                                onCopy={(text) => void copyOutput(text)}
                            />
                            <div class="pane-bottom">
                                <span class="output-state" role="status">
                                    {busy()
                                        ? translation.state.operation === "respell"
                                            ? "Respelling…"
                                            : "Translating…"
                                        : translation.state.status === "stopped"
                                          ? "Stopped"
                                          : translation.state.status === "completed"
                                            ? "Completed"
                                            : ""}
                                </span>
                            </div>
                        </section>
                    </HomePager>
                    <div class="workspace-footer">
                        <div class="footer-message">
                            <p
                                class={
                                    translation.state.error || auth.state.error
                                        ? "error-message"
                                        : "muted"
                                }
                                role={
                                    translation.state.error || auth.state.error
                                        ? "alert"
                                        : undefined
                                }
                            >
                                {footerMessage()}
                            </p>
                            <Show when={locked()}>
                                <Link to={`${basePath}/settings/`}>View your plan</Link>
                            </Show>
                            <Show when={notice()}>
                                <span role="status">{notice()}</span>
                            </Show>
                        </div>
                    </div>
                </main>
            </div>
            <Show when={isPwa && drawerOpen()}>
                <Dialog title="S A P O" onClose={() => setDrawerOpen(false)} class="sidebar-dialog">
                    <Sidebar onNavigate={() => setDrawerOpen(false)} />
                </Dialog>
            </Show>
        </div>
    );
}
