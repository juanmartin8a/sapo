import { Link } from "@tanstack/solid-router";
import { createUniqueId, Show } from "solid-js";
import { useAppState } from "@/providers/AppProvider";
import ModelSelector from "./ModelSelector";

export default function LocalModelControls(props: {
    onNavigate?: () => void;
    managementLabel?: string;
    animateControls?: boolean;
}) {
    const { localModels, translation, basePath, pwa } = useAppState();
    const { state } = localModels;
    const explanationId = createUniqueId();
    const respelling = () => translation.state.operation === "respell";
    const localEnabled = translation.usesLocalModel;
    function setEnabled(enabled: boolean) {
        if (respelling() || enabled === state.enabled) return;
        translation.setError(null);
        localModels.configure({ enabled });
        if (enabled && state.source === "server" && !state.models.length)
            void localModels.refreshModels();
    }
    return (
        <div class="local-model-controls">
            <div
                class="mode-switch local-mode-switch"
                role="group"
                aria-label="Translation provider"
            >
                <button
                    aria-pressed={!localEnabled() ? "true" : "false"}
                    onClick={() => setEnabled(false)}
                >
                    Online{" "}
                    <span
                        class={`connection-dot ${pwa.state.online ? "is-online" : ""}`}
                        aria-label={pwa.state.online ? "Connected" : "Offline"}
                    />
                </button>
                <button
                    aria-pressed={localEnabled() ? "true" : "false"}
                    disabled={respelling()}
                    aria-describedby={respelling() ? explanationId : undefined}
                    onClick={() => setEnabled(true)}
                >
                    Local
                </button>
            </div>
            <Show when={respelling()}>
                <p id={explanationId} class="local-model-notice">
                    Local AI currently supports translation only.
                </p>
            </Show>
            <Show when={localEnabled() || props.animateControls}>
                <div class="local-model-details" data-expanded={localEnabled() ? "true" : "false"}>
                    <div class="local-model-details-content">
                        <fieldset
                            class="local-model-fields"
                            disabled={!localEnabled()}
                            inert={!localEnabled()}
                        >
                            <legend class="sr-only">Local model controls</legend>
                            <ModelSelector />
                            <div class="local-model-actions">
                                <Show
                                    when={state.source === "server"}
                                    fallback={
                                        <button
                                            class="button-primary"
                                            disabled={
                                                state.loading ||
                                                !state.browserModel ||
                                                state.loadedModel === state.browserModel
                                            }
                                            onClick={() => void localModels.loadModel()}
                                        >
                                            {state.loading
                                                ? "Loading…"
                                                : state.loadedModel &&
                                                    state.loadedModel === state.browserModel
                                                  ? "Loaded"
                                                  : "Load model"}
                                        </button>
                                    }
                                >
                                    <button
                                        class="button-secondary"
                                        disabled={state.discovering}
                                        onClick={() => void localModels.refreshModels()}
                                    >
                                        {state.discovering ? "Connecting…" : "Refresh models"}
                                    </button>
                                </Show>
                                <Link
                                    class="button-secondary"
                                    to={`${basePath}/settings/local-ai/`}
                                    onClick={() => props.onNavigate?.()}
                                >
                                    {props.managementLabel ?? "Manage models"}
                                </Link>
                            </div>
                        </fieldset>
                    </div>
                </div>
            </Show>
        </div>
    );
}
