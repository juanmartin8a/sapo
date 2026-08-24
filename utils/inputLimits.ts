import { LOCAL_TRANSLATION_INPUT_LIMIT } from "@/constants/localModels";
import { SUBSCRIPTION_PLAN_LIMITS } from "@/constants/subscription";
import type { TransformationOperation } from "@/types/translation";

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
        return operation === "translate"
            ? SUBSCRIPTION_PLAN_LIMITS.free.translate_input_char_limit
            : SUBSCRIPTION_PLAN_LIMITS.free.respell_input_char_limit;
    }

    return operation === "respell"
        ? SUBSCRIPTION_PLAN_LIMITS.polyglot.respell_input_char_limit
        : SUBSCRIPTION_PLAN_LIMITS.polyglot.translate_input_char_limit;
};

export const getCharacterCount = (text: string) => {
    let count = 0;

    for (let index = 0; index < text.length; index += 1) {
        const codeUnit = text.charCodeAt(index);

        if (
            codeUnit >= 0xD800 &&
            codeUnit <= 0xDBFF &&
            index + 1 < text.length
        ) {
            const nextCodeUnit = text.charCodeAt(index + 1);

            if (nextCodeUnit >= 0xDC00 && nextCodeUnit <= 0xDFFF) {
                index += 1;
            }
        }

        count += 1;
    }

    return count;
};
