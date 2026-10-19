import { Link } from "@tanstack/solid-router";
import { createSignal, Show } from "solid-js";
import { useAppState } from "@/providers/AppProvider";
import { languages, languagesPlusAutoDetect } from "@/constants/translation";
import LanguageSelector from "@/components/ui/LanguageSelector";
import Icon from "@/components/ui/Icon";
import Toggle from "@/components/ui/Toggle";
import AccountControl from "@/components/auth/AccountControl";

export default function Sidebar(props: { onNavigate?: () => void; layout?: "panel" }) {
    const { translation, preferencesReady } = useAppState();
    const [animateOptions, setAnimateOptions] = createSignal(false);
    const busy = () =>
        translation.state.status === "loading" || translation.state.status === "streaming";
    return (
        <div class={`sidebar-inner ${props.layout === "panel" ? "options-panel" : ""}`}>
            <div
                class={`sidebar-options ${animateOptions() ? "animate-options" : ""}`}
                aria-busy={preferencesReady() ? "false" : "true"}
            >
                <div class="mode-switch" role="group" aria-label="Operation">
                    <button
                        aria-pressed={
                            translation.state.operation === "translate" ? "true" : "false"
                        }
                        onClick={() => {
                            setAnimateOptions(true);
                            translation.setPreferences({
                                operation: "translate",
                            });
                        }}
                    >
                        Translate
                    </button>
                    <button
                        aria-pressed={translation.state.operation === "respell" ? "true" : "false"}
                        onClick={() => {
                            setAnimateOptions(true);
                            translation.setPreferences({ operation: "respell" });
                        }}
                    >
                        Respell
                    </button>
                </div>
                <Show when={translation.state.operation === "respell"}>
                    <Toggle
                        class="respell-option"
                        label="Translate first"
                        checked={translation.state.translateThenRespell}
                        onChange={(value) => {
                            setAnimateOptions(true);
                            translation.setPreferences({
                                translateThenRespell: value,
                            });
                        }}
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
                        class={`sidebar-field respell-option ${translation.state.translateThenRespell ? "" : "pane-language-option"}`}
                    >
                        <label>Respell:</label>
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
                        onChange={(singleScreen) => {
                            setAnimateOptions(true);
                            translation.setPreferences({ singleScreen });
                        }}
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
    const { pwa } = useAppState();
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
            <Link class="sidebar-link" to="/app/settings/" onClick={() => props.onNavigate?.()}>
                <Icon name="settings" />
                Settings
                <Icon name="chevron-right" size={15} />
            </Link>
            <AccountControl class="sidebar-account" onNavigate={props.onNavigate} />
        </footer>
    );
}
