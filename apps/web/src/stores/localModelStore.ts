import { createStore } from "solid-js";
import {
    DEFAULT_LOCAL_PREFERENCES,
    loadLocalPreferences,
    saveLocalPreferences,
    type LocalModelPreferences,
} from "@/lib/local-models/config";
import { listServerModels, translateOnServer } from "@/lib/local-models/server";
import { validateModelFiles } from "@/lib/local-models/files";
import type { createBrowserModel } from "@/lib/local-models/browser";
import type { TranslationRequest } from "@/types/translation";

type BrowserModel = ReturnType<typeof createBrowserModel>;
interface ModelEntry {
    id: string;
    name: string;
    size: number;
}

export function createLocalModelStore(onChange: () => void) {
    const [state, setState] = createStore({
        ...DEFAULT_LOCAL_PREFERENCES,
        apiKey: "",
        models: [] as string[],
        discovering: false,
        browserModels: [] as ModelEntry[],
        browserModel: "",
        loadedModel: "",
        loading: false,
        error: null as string | null,
    });
    const files = new Map<string, File[]>();
    let browser: Promise<BrowserModel> | undefined;
    let discovery: AbortController | undefined;
    let loading: AbortController | undefined;
    let disposed = false;
    let importVersion = 0;
    const getBrowser = () =>
        (browser ??= import("@/lib/local-models/browser")
            .then(({ createBrowserModel }) => createBrowserModel())
            .catch((error: unknown) => {
                browser = undefined;
                throw error;
            }));
    const connection = () => ({ baseUrl: state.baseUrl, apiKey: state.apiKey });
    const fail = (error: unknown) => {
        if (!disposed)
            setState((draft) => {
                draft.error =
                    error instanceof Error ? error.message : "Couldn’t use the local model.";
            });
    };
    function cancelDiscovery() {
        discovery?.abort();
        discovery = undefined;
        setState((draft) => {
            draft.discovering = false;
        });
    }
    function unload() {
        loading?.abort();
        setState((draft) => {
            draft.loadedModel = "";
        });
        if (browser) void browser.then((engine) => engine.unload()).catch(fail);
    }
    function configure(preferences: Partial<LocalModelPreferences>) {
        onChange();
        cancelDiscovery();
        if (
            (preferences.source !== undefined && preferences.source !== state.source) ||
            (preferences.acceleration !== undefined &&
                preferences.acceleration !== state.acceleration) ||
            preferences.enabled === false
        )
            unload();
        const newServer =
            preferences.baseUrl !== undefined && preferences.baseUrl !== state.baseUrl;
        setState((draft) => {
            Object.assign(draft, preferences);
            draft.error = null;
            if (newServer) {
                draft.models = [];
                draft.serverModel = "";
                draft.apiKey = "";
            }
        });
        saveLocalPreferences({
            ...state,
            ...preferences,
            ...(newServer ? { serverModel: "" } : {}),
        });
    }
    async function refreshModels() {
        cancelDiscovery();
        const controller = new AbortController();
        discovery = controller;
        setState((draft) => {
            draft.discovering = true;
            draft.error = null;
        });
        try {
            const models = await listServerModels(connection(), controller.signal);
            if (discovery !== controller || disposed) return;
            const serverModel = state.serverModel || models[0] || "";
            setState((draft) => {
                draft.models = models;
                draft.serverModel = serverModel;
            });
            saveLocalPreferences({ ...state, serverModel });
        } catch (error) {
            if (!controller.signal.aborted && discovery === controller) fail(error);
        } finally {
            if (discovery === controller) {
                discovery = undefined;
                setState((draft) => {
                    draft.discovering = false;
                });
            }
        }
    }
    function selectBrowserModel(id: string) {
        if (!files.has(id) || state.browserModel === id) return;
        onChange();
        unload();
        setState((draft) => {
            draft.browserModel = id;
            draft.error = null;
        });
    }
    async function importFiles(input: File[]) {
        const version = ++importVersion;
        try {
            const selected = await validateModelFiles(input);
            if (disposed || version !== importVersion) return;
            const id = crypto.randomUUID();
            files.set(id, selected);
            setState((draft) => {
                draft.browserModels.push({
                    id,
                    name: selected[0].name.replace(/-00001-of-\d{5}/, ""),
                    size: selected.reduce((total, file) => total + file.size, 0),
                });
            });
            selectBrowserModel(id);
        } catch (error) {
            if (version === importVersion) fail(error);
        }
    }
    async function loadModel() {
        if (loading || disposed) return;
        const id = state.browserModel;
        const selected = files.get(id);
        if (!selected) {
            fail(new Error("Choose a GGUF file in Settings first."));
            return;
        }
        onChange();
        const controller = new AbortController();
        loading = controller;
        const acceleration = state.acceleration;
        setState((draft) => {
            draft.loading = true;
            draft.loadedModel = "";
            draft.error = null;
        });
        try {
            const engine = await getBrowser();
            controller.signal.throwIfAborted();
            await engine.load(selected, acceleration, controller.signal);
            if (!controller.signal.aborted && !disposed)
                setState((draft) => {
                    draft.loadedModel = id;
                });
        } catch (error) {
            if (!controller.signal.aborted) fail(error);
        } finally {
            loading = undefined;
            if (!disposed)
                setState((draft) => {
                    draft.loading = false;
                });
        }
    }
    return {
        state,
        configure,
        refreshModels,
        importFiles,
        loadModel,
        selectBrowserModel,
        initialize: () => {
            const preferences = loadLocalPreferences();
            setState((draft) => {
                Object.assign(draft, preferences);
            });
            return preferences;
        },
        setApiKey: (value: string) => {
            onChange();
            cancelDiscovery();
            setState((draft) => {
                draft.apiKey = value;
                draft.models = [];
                draft.error = null;
            });
        },
        unload: () => {
            onChange();
            unload();
        },
        removeModel: (id: string) => {
            if (state.browserModel === id) {
                onChange();
                unload();
                setState((draft) => {
                    draft.browserModel = "";
                });
            }
            files.delete(id);
            setState((draft) => {
                draft.browserModels = draft.browserModels.filter((entry) => entry.id !== id);
            });
        },
        identity: () =>
            state.source === "server"
                ? `server:${state.baseUrl}:${state.serverModel}`
                : `browser:${state.browserModel}`,
        translate: async (
            request: TranslationRequest,
            signal: AbortSignal,
            onText: (text: string) => void,
        ) => {
            if (!state.enabled) throw new Error("Select Local mode first.");
            if (state.source === "server")
                return translateOnServer(connection(), state.serverModel, request, signal, onText);
            if (!state.browserModel || state.loadedModel !== state.browserModel || state.loading)
                throw new Error("Load the selected browser model first.");
            const engine = await getBrowser();
            signal.throwIfAborted();
            try {
                await engine.translate(request, signal, onText);
            } finally {
                if (!disposed && !engine.isLoaded())
                    setState((draft) => {
                        draft.loadedModel = "";
                    });
            }
        },
        dispose: () => {
            disposed = true;
            importVersion++;
            cancelDiscovery();
            unload();
            files.clear();
        },
    };
}
