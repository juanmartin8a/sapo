export const LOCAL_INPUT_LIMIT = 2_000;
export const LOCAL_OUTPUT_TOKENS = 4_096;
export const LOCAL_SETTINGS_KEY = "sapo.local-models.v1";
export const SERVER_PRESETS = [
    { id: "ollama", name: "Ollama", url: "http://localhost:11434/v1" },
    { id: "lmstudio", name: "LM Studio", url: "http://localhost:1234/v1" },
    { id: "llama-app", name: "llama.app", url: "http://localhost:9931/v1" },
    { id: "llama-cpp", name: "llama.cpp", url: "http://localhost:8080/v1" },
    { id: "custom", name: "Custom", url: "" },
] as const;

export interface LocalModelPreferences {
    enabled: boolean;
    source: "server" | "browser";
    preset: string;
    baseUrl: string;
    serverModel: string;
    acceleration: "auto" | "cpu";
}

export const DEFAULT_LOCAL_PREFERENCES: LocalModelPreferences = {
    enabled: false,
    source: "server",
    preset: "ollama",
    baseUrl: SERVER_PRESETS[0].url,
    serverModel: "",
    acceleration: "auto",
};

export function normalizeServerUrl(value: string): string {
    let url: URL;
    try {
        url = new URL(value.trim());
    } catch {
        throw new Error("Enter the server’s full API URL, such as http://localhost:11434/v1.");
    }
    if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
    )
        throw new Error(
            "Use an HTTP or HTTPS API URL without credentials, query parameters, or a fragment.",
        );
    return url.href.replace(/\/+$/, "");
}

export function parseLocalPreferences(value: unknown): LocalModelPreferences {
    const result = { ...DEFAULT_LOCAL_PREFERENCES };
    if (!value || typeof value !== "object") return result;
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.enabled === "boolean") result.enabled = candidate.enabled;
    if (candidate.source === "server" || candidate.source === "browser")
        result.source = candidate.source;
    if (SERVER_PRESETS.some((preset) => preset.id === candidate.preset))
        result.preset = candidate.preset as string;
    if (typeof candidate.baseUrl === "string") {
        try {
            result.baseUrl = normalizeServerUrl(candidate.baseUrl);
        } catch {
            /* Ignore invalid saved URLs. */
        }
    }
    if (typeof candidate.serverModel === "string" && candidate.serverModel.length <= 512)
        result.serverModel = candidate.serverModel.trim();
    if (candidate.acceleration === "cpu") result.acceleration = "cpu";
    return result;
}

export function loadLocalPreferences(): LocalModelPreferences {
    try {
        return parseLocalPreferences(
            JSON.parse(localStorage.getItem(LOCAL_SETTINGS_KEY) ?? "null"),
        );
    } catch {
        return { ...DEFAULT_LOCAL_PREFERENCES };
    }
}

export function saveLocalPreferences(preferences: LocalModelPreferences) {
    try {
        localStorage.setItem(
            LOCAL_SETTINGS_KEY,
            JSON.stringify(parseLocalPreferences(preferences)),
        );
    } catch {
        /* Preferences remain usable when storage is unavailable. */
    }
}
