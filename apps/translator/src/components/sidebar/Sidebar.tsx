import { Link } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { useAppState } from "@/providers/AppProvider";
import { languages, languagesPlusAutoDetect } from "@/constants/translation";
import LanguageSelector from "@/components/ui/LanguageSelector";
import Icon from "@/components/ui/Icon";
import Toggle from "@/components/ui/Toggle";

export default function Sidebar(props: {
    onNavigate?: () => void;
    layout?: "panel";
}) {
    const { translation } = useAppState();
    const busy = () =>
        translation.state.status === "loading" ||
        translation.state.status === "streaming";
    return (
        <div
            class={`sidebar-inner ${props.layout === "panel" ? "options-panel" : ""}`}
        >
            <div class="sidebar-options">
                <div class="mode-switch" role="group" aria-label="Operation">
                    <button
                        aria-pressed={
                            translation.state.operation === "translate"
                                ? "true"
                                : "false"
                        }
                        onClick={() =>
                            translation.setPreferences({
                                operation: "translate",
                            })
                        }
                    >
                        Translate
                    </button>
                    <button
                        aria-pressed={
                            translation.state.operation === "respell"
                                ? "true"
                                : "false"
                        }
                        onClick={() =>
                            translation.setPreferences({ operation: "respell" })
                        }
                    >
                        Respell
                    </button>
                </div>
                <Show when={translation.state.operation === "respell"}>
                    <Toggle
                        label="Translate & Respell"
                        checked={translation.state.translateThenRespell}
                        onChange={(value) =>
                            translation.setPreferences({
                                translateThenRespell: value,
                            })
                        }
                    />
                </Show>
                <div class="sidebar-field pane-language-option">
                    <label>Source language</label>
                    <LanguageSelector
                        label="Source language"
                        options={Object.values(languagesPlusAutoDetect)}
                        value={translation.state.sourceLanguage}
                        onChange={(sourceLanguage) =>
                            translation.setPreferences({ sourceLanguage })
                        }
                        disabled={busy()}
                    />
                </div>
                <Show
                    when={
                        translation.state.operation === "translate" ||
                        translation.state.translateThenRespell
                    }
                >
                    <div class="sidebar-field pane-language-option">
                        <label>Target language</label>
                        <LanguageSelector
                            label="Target language"
                            options={Object.values(languages)}
                            value={translation.state.targetLanguage}
                            onChange={(targetLanguage) =>
                                translation.setPreferences({ targetLanguage })
                            }
                            disabled={busy()}
                        />
                    </div>
                </Show>
                <Show when={translation.state.operation === "respell"}>
                    <div
                        class={`sidebar-field ${translation.state.translateThenRespell ? "" : "pane-language-option"}`}
                    >
                        <label>Respell using</label>
                        <LanguageSelector
                            label="Respell language"
                            options={["Source", ...Object.values(languages)]}
                            value={translation.state.respellLanguage}
                            onChange={(respellLanguage) =>
                                translation.setPreferences({ respellLanguage })
                            }
                            disabled={busy()}
                        />
                    </div>
                </Show>
                <div class="mobile-only sidebar-layout">
                    <Toggle
                        label="Single screen"
                        description="Keep input and output together"
                        checked={translation.state.singleScreen}
                        onChange={(singleScreen) =>
                            translation.setPreferences({ singleScreen })
                        }
                    />
                </div>
            </div>
            <Show when={props.layout !== "panel"}>
                <SidebarAccountActions onNavigate={props.onNavigate} />
            </Show>
        </div>
    );
}

export function SidebarAccountActions(props: { onNavigate?: () => void }) {
    const { auth, pwa } = useAppState();
    return (
        <footer class="sidebar-footer">
            <Show when={pwa.state.installable && !pwa.state.installed}>
                <button
                    class="sidebar-link"
                    onClick={() => {
                        void pwa.install();
                        props.onNavigate?.();
                    }}
                >
                    <span class="install-symbol" aria-hidden="true">
                        ↓
                    </span>
                    Install SAPO
                </button>
            </Show>
            <Link
                class="sidebar-link"
                to="/settings"
                onClick={() => props.onNavigate?.()}
            >
                <Icon name="settings" />
                Settings
                <Icon name="chevron-right" size={15} />
            </Link>
            <Show
                when={auth.state.status === "authenticated"}
                fallback={
                    <Link
                        class="sidebar-account sidebar-signin"
                        to="/auth"
                        onClick={() => props.onNavigate?.()}
                    >
                        <Icon name="log-in" size={20} />
                        <span>Sign in</span>
                    </Link>
                }
            >
                <Link
                    class="sidebar-account"
                    to="/settings"
                    onClick={() => props.onNavigate?.()}
                >
                    <span class="account-avatar">
                        {auth.state.name?.slice(0, 1).toUpperCase() ?? ":)"}
                    </span>
                    <span class="account-details">
                        {auth.state.name || "Your account"}
                        <span class="account-subtitle">
                            {auth.state.hasActiveSubscription
                                ? "Polyglot"
                                : "Free"}
                        </span>
                    </span>
                </Link>
            </Show>
        </footer>
    );
}
