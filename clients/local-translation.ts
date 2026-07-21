import { ABORT_ERROR_NAME } from "@/constants/errors";
import { LOCAL_TRANSLATIONS_MOBILE_ONLY_ERROR } from "@/constants/localModels";

type LocalTranslationArgs = {
    inputLanguage: string;
    targetLanguage: string;
    input: string;
};

type LocalTranslationOptions = {
    signal?: AbortSignal;
    onReady?: () => void;
    onToken?: (token: string) => void;
};

export const isLocalTranslationAbortError = (error: unknown) => {
    return error instanceof Error && error.name === ABORT_ERROR_NAME;
};

export const stopActiveLocalTranslation = async () => undefined;

export const releaseLocalTranslationModel = async () => undefined;

export const runWithLocalTranslationModelReleased = async <Result>(
    _modelId: string,
    operation: () => Promise<Result>
) => operation();

export const getLoadedLocalTranslationModelId = () => null;

export const ensureLocalTranslationModelLoaded = async (_modelId?: string | null) => undefined;

export const translateWithLocalModel = async (
    _args: LocalTranslationArgs,
    _options: LocalTranslationOptions = {}
): Promise<string> => {
    throw new Error(LOCAL_TRANSLATIONS_MOBILE_ONLY_ERROR);
};
