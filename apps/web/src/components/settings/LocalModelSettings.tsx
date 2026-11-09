import { createUniqueId, For, Show } from "solid-js";
import { useAppState } from "@/providers/AppProvider";
import { SERVER_PRESETS } from "@/lib/local-models/config";
import ModelSelector from "@/components/local-models/ModelSelector";

export default function LocalModelSettings() {
    const { localModels, translation, preferencesReady } = useAppState();
    const { state } = localModels;
    const modelWarningId = createUniqueId();
    return (
        <section
            class="settings-section local-model-settings"
            aria-label="Local model configuration"
        >
            <p class="settings-note muted">
                Translate without a SAPO account. Select Local on the translator to use your model.
                Respelling uses Online mode.
            </p>
            <fieldset class="local-settings-controls" disabled={!preferencesReady()}>
                <legend class="sr-only">Local model configuration</legend>
                <label class="settings-row local-setting-field">
                    <span>Run models</span>
                    <select
                        aria-label="Run models"
                        value={state.source}
                        onChange={(event) =>
                            localModels.configure({
                                source:
                                    event.currentTarget.value === "browser" ? "browser" : "server",
                            })
                        }
                    >
                        <option value="server">Local server</option>
                        <option value="browser">In this browser</option>
                    </select>
                </label>
                <Show
                    when={state.source === "server"}
                    fallback={
                        <div class="local-settings-fields">
                            <p class="settings-note muted">
                                Choose an instruction-tuned GGUF model, or all numbered shards of
                                one model together. Each file must be smaller than 2 GB. Files stay
                                on your device and must be selected again after reloading the page.
                            </p>
                            <label class="local-setting-field">
                                <span>Add GGUF model</span>
                                <input
                                    type="file"
                                    accept=".gguf"
                                    multiple
                                    disabled={state.loading}
                                    onChange={(event) => {
                                        const input = event.currentTarget;
                                        if (input.files?.length)
                                            void localModels.importFiles(Array.from(input.files));
                                        input.value = "";
                                    }}
                                />
                            </label>
                            <label class="local-setting-field">
                                <span>Acceleration</span>
                                <select
                                    aria-label="Acceleration"
                                    value={state.acceleration}
                                    disabled={state.loading}
                                    onChange={(event) =>
                                        localModels.configure({
                                            acceleration:
                                                event.currentTarget.value === "cpu"
                                                    ? "cpu"
                                                    : "auto",
                                        })
                                    }
                                >
                                    <option value="auto">Automatic (WebGPU when available)</option>
                                    <option value="cpu">CPU</option>
                                </select>
                            </label>
                            <ModelSelector />
                            <div class="local-model-actions">
                                <button
                                    class="button-primary"
                                    disabled={
                                        !state.browserModel ||
                                        state.loading ||
                                        translation.busy() ||
                                        state.loadedModel === state.browserModel
                                    }
                                    onClick={() => void localModels.loadModel()}
                                >
                                    {state.loading ? "Loading model…" : "Load model"}
                                </button>
                                <button
                                    class="button-secondary"
                                    disabled={!state.loadedModel && !state.loading}
                                    onClick={() => localModels.unload()}
                                >
                                    {state.loading ? "Cancel loading" : "Unload model"}
                                </button>
                            </div>
                            <p class="settings-note muted" role="status">
                                {state.loading
                                    ? "Preparing the model. This can take a while."
                                    : state.loadedModel
                                      ? "Model loaded and ready to translate."
                                      : "No browser model is loaded."}
                            </p>
                            <For each={state.browserModels}>
                                {(model) => (
                                    <div class="settings-row local-file-row">
                                        <span>
                                            {model.name}
                                            <small>
                                                {(model.size / 1024 ** 2).toLocaleString(
                                                    undefined,
                                                    {
                                                        maximumFractionDigits: 0,
                                                    },
                                                )}{" "}
                                                MB
                                            </small>
                                        </span>
                                        <button
                                            class="text-button"
                                            aria-label={`Remove ${model.name}`}
                                            onClick={() => localModels.removeModel(model.id)}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                )}
                            </For>
                            <p class="settings-note muted">
                                Smaller quantized models use less memory. Browser and model support
                                vary; try CPU mode if automatic loading fails. Once loaded,
                                translation can run without internet while this page remains open.
                            </p>
                        </div>
                    }
                >
                    <div class="local-settings-fields">
                        <label class="local-setting-field">
                            <span>Server</span>
                            <select
                                aria-label="Server"
                                value={state.preset}
                                onChange={(event) => {
                                    const preset = SERVER_PRESETS.find(
                                        (entry) => entry.id === event.currentTarget.value,
                                    )!;
                                    localModels.configure({
                                        preset: preset.id,
                                        ...(preset.url ? { baseUrl: preset.url } : {}),
                                    });
                                }}
                            >
                                <For each={SERVER_PRESETS}>
                                    {(preset) => <option value={preset.id}>{preset.name}</option>}
                                </For>
                            </select>
                        </label>
                        <label class="local-setting-field">
                            <span>API base URL</span>
                            <input
                                type="url"
                                value={state.baseUrl}
                                spellcheck={false}
                                autocapitalize="none"
                                placeholder="http://localhost:11434/v1"
                                onChange={(event) =>
                                    localModels.configure({
                                        baseUrl: event.currentTarget.value.trim(),
                                        preset: "custom",
                                    })
                                }
                            />
                        </label>
                        <label class="local-setting-field">
                            <span>API key (optional, kept for this session)</span>
                            <input
                                type="password"
                                value={state.apiKey}
                                autocomplete="off"
                                spellcheck={false}
                                onChange={(event) =>
                                    localModels.setApiKey(event.currentTarget.value)
                                }
                            />
                        </label>
                        <div class="local-model-actions">
                            <button
                                class="button-secondary"
                                disabled={state.discovering}
                                onClick={() => void localModels.refreshModels()}
                            >
                                {state.discovering ? "Connecting…" : "Connect / refresh models"}
                            </button>
                        </div>
                        <ModelSelector />
                        <label class="local-setting-field">
                            <span>Model ID (manual override)</span>
                            <input
                                type="text"
                                value={state.serverModel}
                                maxlength={512}
                                spellcheck={false}
                                autocapitalize="none"
                                aria-describedby={
                                    localModels.serverModelNotFound() ? modelWarningId : undefined
                                }
                                onChange={(event) => {
                                    const model = event.currentTarget.value.trim();
                                    localModels.configure({
                                        serverModel: model,
                                    });
                                    if (model) void localModels.refreshModels();
                                }}
                            />
                            <Show when={localModels.serverModelNotFound()}>
                                <span id={modelWarningId} class="error-message" role="status">
                                    Model not found in the server’s model list. You can still use
                                    this override.
                                </span>
                            </Show>
                        </label>
                        <p class="settings-note muted">
                            Start a server version that supports /v1/responses. Allow this website’s
                            origin in the server’s CORS settings and grant local network access when
                            asked. The model list comes from your server; some servers only list
                            loaded models.
                        </p>
                        <Show when={state.preset === "ollama"}>
                            <p class="settings-note muted">
                                For Ollama, add this website’s origin to OLLAMA_ORIGINS and restart
                                Ollama.
                            </p>
                        </Show>
                        <Show when={state.preset === "lmstudio"}>
                            <p class="settings-note muted">
                                In LM Studio’s server settings, enable CORS and start the server.
                            </p>
                        </Show>
                        <p class="settings-note muted">
                            Requests go directly from this browser to the configured server. Choose
                            a downloaded model for local processing; your server may also offer
                            cloud models. On a phone, localhost refers to the phone, not your
                            computer.
                        </p>
                    </div>
                </Show>
                <Show when={state.error}>
                    <p class="error-message" role="alert">
                        {state.error}
                    </p>
                </Show>
            </fieldset>
        </section>
    );
}
