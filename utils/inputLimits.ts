import type { TransformationOperation } from "@/stores/transformationOperationStore";

export const getInputLimit = (
    operation: TransformationOperation,
    hasActiveSubscription: boolean | null
) => {
    if (hasActiveSubscription === null) {
        return null;
    }

    if (!hasActiveSubscription) {
        return 10;
    }

    return operation === "respell" ? 300 : 1_000;
};

export const getCharacterCount = (text: string) => Array.from(text).length;
