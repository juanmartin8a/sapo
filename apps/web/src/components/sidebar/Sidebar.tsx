import { createSignal, Show } from "solid-js";
import { useAppState } from "@/providers/AppProvider";
import { languages, languagesPlusAutoDetect } from "@/constants/translation";
import LanguageSelector from "@/components/ui/LanguageSelector";
import Toggle from "@/components/ui/Toggle";
import AccountControl from "@/components/auth/AccountControl";
import TranslateButton from "@/components/home/TranslateButton";

export default function Sidebar(props: { onNavigate?: () => void; layout?: "panel" }) {
    const { translation, preferencesReady, isPwa } = useAppState();
    const captionedSelector = () => props.layout === "panel" && !isPwa;
    const [animateOptions, setAnimateOptions] = createSignal(false);
    const { busy } = translation;
    return (
        <div class={`sidebar-inner ${props.layout === "panel" ? "options-panel" : ""}`}>
            <div
                class={`sidebar-options ${animateOptions() ? "animate-options" : ""}`}
                aria-busy={preferencesReady() ? "false" : "true"}
            >
                <div class="operation-mode-row">
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
                            aria-pressed={
                                translation.state.operation === "respell" ? "true" : "false"
                            }
                            onClick={() => {
                                setAnimateOptions(true);
                                translation.setPreferences({ operation: "respell" });
                            }}
                        >
                            Respell
                        </button>
                    </div>
                    {/* Keep the button under this owner for matching SSR and hydration keys. */}
                    <Show when={props.layout === "panel"}>
                        <TranslateButton />
                    </Show>
                </div>
                <Show when={props.layout !== "panel" || translation.state.operation === "respell"}>
                    <div class="operation-options">
                        <div class="operation-option-fields">
                            <Show when={isPwa}>
                                <div class="sidebar-layout">
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
                            </Show>
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
                            <div class="sidebar-field pane-language-option source-language-field">
                                <label>{isPwa ? "Source:" : "Source language"}</label>
                                <LanguageSelector
                                    label={isPwa ? "Source" : "Source language"}
                                    options={Object.values(languagesPlusAutoDetect)}
                                    value={translation.state.sourceLanguage}
                                    onChange={(sourceLanguage) =>
                                        translation.setPreferences({ sourceLanguage })
                                    }
                                    disabled={busy()}
                                />
                            </div>
                            <div class="sidebar-field pane-language-option">
                                <label>{isPwa ? "Target:" : "Target language"}</label>
                                <LanguageSelector
                                    label={isPwa ? "Target" : "Target language"}
                                    options={Object.values(languages)}
                                    value={translation.state.targetLanguage}
                                    onChange={(targetLanguage) =>
                                        translation.setPreferences({ targetLanguage })
                                    }
                                    disabled={busy()}
                                />
                            </div>
                            <Show
                                when={
                                    translation.state.operation === "respell" &&
                                    (translation.state.translateThenRespell || captionedSelector())
                                }
                            >
                                <div
                                    class={`sidebar-field respell-option respell-language-field ${captionedSelector() ? "sidebar-field-captioned" : ""}`}
                                    aria-hidden={
                                        translation.state.translateThenRespell ? undefined : "true"
                                    }
                                    inert={!translation.state.translateThenRespell}
                                >
                                    <Show when={!captionedSelector()}>
                                        <label>Respell:</label>
                                    </Show>
                                    <LanguageSelector
                                        label={isPwa ? "Respell" : "Respell language"}
                                        caption={captionedSelector() ? "Respell" : undefined}
                                        options={["Source", ...Object.values(languages)]}
                                        value={translation.state.respellLanguage}
                                        onChange={(respellLanguage) =>
                                            translation.setPreferences({ respellLanguage })
                                        }
                                        disabled={busy()}
                                    />
                                </div>
                            </Show>
                        </div>
                    </div>
                </Show>
            </div>
            <Show when={props.layout !== "panel"}>
                <SidebarAccountActions onNavigate={props.onNavigate} />
            </Show>
        </div>
    );
}

function SidebarAccountActions(props: { onNavigate?: () => void }) {
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
            <AccountControl class="sidebar-account" onNavigate={props.onNavigate} />
        </footer>
    );
}
