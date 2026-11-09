import { createMemo, For, Show } from "solid-js";
import { useAppState } from "@/providers/AppProvider";

export default function ModelSelector() {
    const { localModels, translation } = useAppState();
    const { state } = localModels;
    const server = () => state.source === "server";
    const selectedModel = () => (server() ? state.serverModel : state.browserModel);
    const options = createMemo(() =>
        server()
            ? [
                  ...new Set([...state.models, ...(state.serverModel ? [state.serverModel] : [])]),
              ].map((id) => ({ id, name: id }))
            : state.browserModels,
    );
    return (
        <label class="local-model-selector">
            <span>Local model:</span>
            <select
                aria-label="Local model"
                disabled={
                    translation.busy() || state.loading || state.discovering || !options().length
                }
                onChange={(event) =>
                    server()
                        ? localModels.configure({ serverModel: event.currentTarget.value })
                        : localModels.selectBrowserModel(event.currentTarget.value)
                }
            >
                <Show when={!selectedModel()}>
                    <option value="" selected>
                        None
                    </option>
                </Show>
                <For each={options()}>
                    {(model) => (
                        <option value={model.id} selected={model.id === selectedModel()}>
                            {model.name}
                        </option>
                    )}
                </For>
            </select>
        </label>
    );
}
