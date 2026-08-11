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

export const getCharacterCount = (text: string) => Array.from(text).length;
