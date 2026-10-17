import { Link, useNavigate } from "@tanstack/solid-router";
import { createMemo, createSignal, onSettled, Show } from "solid-js";
import { useAppState } from "@/providers/AppProvider";
import {
    DEFAULT_SUBSCRIPTION_PLAN_LIMITS,
    languages,
    languagesPlusAutoDetect,
} from "@/constants/translation";
import Sidebar, { SidebarAccountActions } from "@/components/sidebar/Sidebar";
import Dialog from "@/components/ui/Dialog";
import Icon from "@/components/ui/Icon";
import LanguageSelector from "@/components/ui/LanguageSelector";
import TranslationOutput from "./TranslationOutput";
import HomePager from "./HomePager";
import SiteHeader from "./SiteHeader";

export default function HomeScreen() {
    const { translation, auth, pwa } = useAppState();
    const navigate = useNavigate();
    const [drawerOpen, setDrawerOpen] = createSignal(false);
    const [wideScreen, setWideScreen] = createSignal(false);
    const [notice, setNotice] = createSignal<string | null>(null);
    const busy = () =>
        translation.state.status === "loading" ||
        translation.state.status === "streaming";
    const characterCount = createMemo(
        () => Array.from(translation.state.input).length,
    );
    const plan = () =>
        DEFAULT_SUBSCRIPTION_PLAN_LIMITS[
            auth.state.hasActiveSubscription ? "polyglot" : "free"
        ];
    const inputLimit = () =>
        translation.state.operation === "respell"
            ? plan().respell_input_char_limit
            : plan().translate_input_char_limit;
    const locked = () =>
        translation.state.operation === "respell" &&
        auth.state.hasActiveSubscription === false;
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
            translation.setError(
                "You’re offline. Connect to the internet to continue.",
            );
            return;
        }
        if (auth.state.status === "checking") {
            translation.setError(
                "Your account is still being checked. Please try again in a moment.",
            );
            return;
        }
        if (auth.state.status !== "authenticated") {
            void navigate({ to: "/auth" });
            return;
        }
        if (auth.state.hasActiveSubscription === null) {
            translation.setError(
                "Your plan is still being checked. Please try again in a moment.",
            );
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
            if (media.matches) setDrawerOpen(false);
        };
        resize();
        media.addEventListener("change", resize);
        const shortcut = (event: KeyboardEvent) => {
            if (
                (event.metaKey || event.ctrlKey) &&
                event.key === "Enter" &&
                !document.querySelector("dialog[open]")
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

    async function copyOutput() {
        try {
            await navigator.clipboard.writeText(translation.state.displayText);
            setNotice("Copied to clipboard.");
        } catch {
            setNotice(
                "Couldn’t copy. You can select the text and copy it manually.",
            );
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
            <SiteHeader />
            <header class="app-header mobile-only">
                <div class="header-left">
                    <button
                        class="icon-button mobile-only"
                        aria-label="Toggle sidebar"
                        aria-expanded={drawerOpen() ? "true" : "false"}
                        onClick={() => setDrawerOpen(true)}
                    >
                        <Icon name="sidebar" size={40} />
                    </button>
                </div>
                <Link class="wordmark" to="/" aria-label="SAPO home">
                    S A P O
                </Link>
                <div class="header-right">
                    <TranslationAction />
                </div>
            </header>
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
                <div class="desktop-options">
                    <div class="desktop-toolbar">
                        <nav aria-label="Translation options">
                            <Sidebar layout="panel" />
                        </nav>
                        <div class="header-account">
                            <SidebarAccountActions />
                        </div>
                    </div>
                </div>
                <main
                    class={`workspace ${translation.state.singleScreen ? "mobile-single-screen" : ""} ${translation.state.mobilePane === "output" ? "show-output" : "show-input"}`}
                >
                    <header class="workspace-header">
                        <h1>{operationLabel()}</h1>
                    </header>
                    <div
                        class="mobile-tabs"
                        role="group"
                        aria-label="Workspace view"
                    >
                        <button
                            aria-pressed={
                                translation.state.mobilePane === "input"
                                    ? "true"
                                    : "false"
                            }
                            onClick={() => translation.setMobilePane("input")}
                        >
                            Input
                        </button>
                        <button
                            aria-pressed={
                                translation.state.mobilePane === "output"
                                    ? "true"
                                    : "false"
                            }
                            onClick={() => translation.setMobilePane("output")}
                        >
                            Output
                            <Show when={busy()}>
                                <span class="status-dot" />
                            </Show>
                        </button>
                    </div>
                    <HomePager>
                        <section
                            class="input-pane"
                            aria-label="Input"
                            inert={
                                !wideScreen() &&
                                !translation.state.singleScreen &&
                                translation.state.mobilePane !== "input"
                            }
                        >
                            <div class="pane-toolbar">
                                <LanguageSelector
                                    label="Source language"
                                    options={Object.values(
                                        languagesPlusAutoDetect,
                                    )}
                                    value={translation.state.sourceLanguage}
                                    onChange={(sourceLanguage) =>
                                        translation.setPreferences({
                                            sourceLanguage,
                                        })
                                    }
                                    disabled={busy()}
                                />
                                <span class="pane-label desktop-only">
                                    INPUT
                                </span>
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
                                onInput={(event) =>
                                    translation.setInput(
                                        event.currentTarget.value,
                                    )
                                }
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
                                    <span class="character-unit">
                                        {" "}
                                        characters
                                    </span>
                                </span>
                                <span class="keyboard-hint desktop-only">
                                    ⌘ / Ctrl + Enter
                                </span>
                            </div>
                        </section>
                        <button
                            class="swap-button"
                            aria-label="Swap source and target languages"
                            disabled={
                                busy() ||
                                (translation.state.operation === "respell" &&
                                    !translation.state.translateThenRespell)
                            }
                            onClick={() => translation.swapLanguages()}
                        >
                            ⇄
                        </button>
                        <section
                            class="output-pane"
                            aria-label="Output"
                            inert={
                                !wideScreen() &&
                                !translation.state.singleScreen &&
                                translation.state.mobilePane !== "output"
                            }
                            aria-busy={busy() ? "true" : "false"}
                        >
                            <div class="pane-toolbar">
                                <Show
                                    when={
                                        translation.state.operation ===
                                            "translate" ||
                                        translation.state.translateThenRespell
                                    }
                                    fallback={
                                        <LanguageSelector
                                            label="Respell language"
                                            options={[
                                                "Source",
                                                ...Object.values(languages),
                                            ]}
                                            value={
                                                translation.state
                                                    .respellLanguage
                                            }
                                            onChange={(respellLanguage) =>
                                                translation.setPreferences({
                                                    respellLanguage,
                                                })
                                            }
                                            disabled={busy()}
                                        />
                                    }
                                >
                                    <LanguageSelector
                                        label="Target language"
                                        options={Object.values(languages)}
                                        value={translation.state.targetLanguage}
                                        onChange={(targetLanguage) =>
                                            translation.setPreferences({
                                                targetLanguage,
                                            })
                                        }
                                        disabled={busy()}
                                    />
                                </Show>
                                <span class="pane-label desktop-only">
                                    OUTPUT
                                </span>
                                <button
                                    class="icon-button copy-button"
                                    aria-label="Copy output"
                                    disabled={!translation.state.displayText}
                                    onClick={() => void copyOutput()}
                                >
                                    <span aria-hidden="true">⧉</span>
                                </button>
                            </div>
                            <TranslationOutput />
                            <div class="pane-bottom">
                                <span class="output-state" role="status">
                                    {busy()
                                        ? translation.state.operation === "respell"
                                            ? "Respelling…"
                                            : "Translating…"
                                        : translation.state.status === "stopped"
                                          ? "Stopped"
                                          : translation.state.status ===
                                              "completed"
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
                                <Link to="/settings">View your plan</Link>
                            </Show>
                            <Show when={notice()}>
                                <span role="status">{notice()}</span>
                            </Show>
                        </div>
                        <div class="output-actions desktop-only">
                            <TranslationAction />
                        </div>
                    </div>
                </main>
            </div>
            <Show when={drawerOpen()}>
                <Dialog
                    title="S A P O"
                    onClose={() => setDrawerOpen(false)}
                    class="sidebar-dialog"
                >
                    <Sidebar onNavigate={() => setDrawerOpen(false)} />
                </Dialog>
            </Show>
        </div>
    );
}
