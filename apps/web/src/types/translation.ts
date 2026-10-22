export type { TranslationStreamToken } from "@sapo/client-core/translation-stream";
import type { TranslationStreamArguments } from "@sapo/client-core/translation-stream";

export type TransformationOperation = TranslationStreamArguments["operation"];
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
