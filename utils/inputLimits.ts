import type { TransformationOperation } from "@/types/translation";

export const LOCAL_TRANSLATION_INPUT_LIMIT = 2_000;
export const FREE_TRANSLATION_INPUT_LIMIT = 500;
export const PAID_TRANSLATION_INPUT_LIMIT = 10_000;
export const PAID_RESPELL_INPUT_LIMIT = 2_000;

export const getInputLimit = (
    operation: TransformationOperation,
    hasActiveSubscription: boolean | null,
    isLocalTranslation = false
) => {
    if (operation === "translate" && isLocalTranslation) {
        return LOCAL_TRANSLATION_INPUT_LIMIT;
    }

    if (hasActiveSubscription === null) {
        return null;
    }

    if (!hasActiveSubscription) {
        return operation === "translate" ? FREE_TRANSLATION_INPUT_LIMIT : 0;
    }

    return operation === "respell" ? PAID_RESPELL_INPUT_LIMIT : PAID_TRANSLATION_INPUT_LIMIT;
};

export const getCharacterCount = (text: string) => Array.from(text).length;
