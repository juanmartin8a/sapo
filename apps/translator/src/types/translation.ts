export type TransformationOperation = "translate" | "respell";
export type MobilePane = "input" | "output";
export type TranslationStatus =
    "idle" | "loading" | "streaming" | "completed" | "stopped" | "error";

export interface TranslationRequest {
    operation: TransformationOperation;
    inputLanguage: string;
    targetLanguage: string;
    input: string;
    translateThenRespell: boolean;
    respellLanguage: string;
}

export interface TranslationStreamToken {
    type: string;
    value?: string;
    input?: string;
    output?: string;
}
