import {
    languages,
    languagesPlusAutoDetect,
    PREFERENCES_STORAGE_KEY,
} from "@/constants/translation";
import type { TransformationOperation } from "@/types/translation";

const languageNames = new Set<string>(Object.values(languages));
const sourceLanguageNames = new Set<string>(Object.values(languagesPlusAutoDetect));

export interface Preferences {
    operation: TransformationOperation;
    sourceLanguage: string;
    targetLanguage: string;
    respellLanguage: string;
    translateThenRespell: boolean;
    singleScreen: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
    operation: "translate",
    sourceLanguage: "Auto-detect",
    targetLanguage: "English",
    respellLanguage: "Source",
    translateThenRespell: false,
    singleScreen: false,
};

export function parsePreferences(value: unknown): Preferences {
    const result = { ...DEFAULT_PREFERENCES };
    if (!value || typeof value !== "object") return result;
    const candidate = value as Record<string, unknown>;
    if (candidate.operation === "translate" || candidate.operation === "respell")
        result.operation = candidate.operation;
    if (
        typeof candidate.sourceLanguage === "string" &&
        sourceLanguageNames.has(candidate.sourceLanguage)
    )
        result.sourceLanguage = candidate.sourceLanguage;
    if (typeof candidate.targetLanguage === "string" && languageNames.has(candidate.targetLanguage))
        result.targetLanguage = candidate.targetLanguage;
    if (
        typeof candidate.respellLanguage === "string" &&
        (candidate.respellLanguage === "Source" || languageNames.has(candidate.respellLanguage))
    )
        result.respellLanguage = candidate.respellLanguage;
    if (typeof candidate.translateThenRespell === "boolean")
        result.translateThenRespell = candidate.translateThenRespell;
    if (typeof candidate.singleScreen === "boolean") result.singleScreen = candidate.singleScreen;
    return result;
}

export function loadPreferences() {
    try {
        return parsePreferences(
            JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "null"),
        );
    } catch {
        return { ...DEFAULT_PREFERENCES };
    }
}

export function savePreferences(preferences: Preferences) {
    try {
        localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
    } catch {
        /* Preferences are optional when browser storage is unavailable. */
    }
}
