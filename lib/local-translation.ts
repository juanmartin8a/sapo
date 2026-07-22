import { ABORT_ERROR_NAME } from "@/constants/errors";
import { LOCAL_TRANSLATIONS_MOBILE_ONLY_ERROR } from "@/constants/localModels";
import type { LocalTranslationModelId } from "@/types/localModels";
import type { LocalTranslationArgs, LocalTranslationOptions } from "@/types/localTranslation";

export const isLocalTranslationAbortError = (error: unknown) => {
    return error instanceof Error && error.name === ABORT_ERROR_NAME;
};

export const stopActiveLocalTranslation = async () => undefined;

export const releaseLocalTranslationModel = async () => undefined;

export const runWithLocalTranslationModelReleased = async <Result>(
    _modelId: LocalTranslationModelId,
    operation: () => Promise<Result>
): Promise<Result> => operation();

export const getLoadedLocalTranslationModelId = (): LocalTranslationModelId | null => null;

export const ensureLocalTranslationModelLoaded = async (
    _modelId?: LocalTranslationModelId | null
): Promise<void> => undefined;

export const translateWithLocalModel = async (
    _args: LocalTranslationArgs,
    _options: LocalTranslationOptions = {}
): Promise<string> => {
    throw new Error(LOCAL_TRANSLATIONS_MOBILE_ONLY_ERROR);
};
