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
    return error instanceof Error && error.name === "AbortError";
};

export const stopActiveLocalTranslation = async () => undefined;

export const releaseLocalTranslationModel = async () => undefined;

export const getLoadedLocalTranslationModelId = () => null;

export const ensureLocalTranslationModelLoaded = async (_modelId?: string | null) => undefined;

export const translateWithLocalModel = async (
    _args: LocalTranslationArgs,
    _options: LocalTranslationOptions = {}
): Promise<string> => {
    throw new Error("Local translations are available on iOS and Android only.");
};
