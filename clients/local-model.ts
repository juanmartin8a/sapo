export const LOCAL_TRANSLATION_MODELS = [
    {
        id: "gemma4-e2b-it",
        label: "Gemma 4 E2B Instruct",
        displayName: "Gemma4 e2b",
        format: "LiteRT-LM",
        baseModel: "google/gemma-4-E2B-it",
        repository: "litert-community/gemma-4-E2B-it-litert-lm",
        fileName: "gemma-4-E2B-it.litertlm",
        sizeBytes: 2_588_147_712,
        downloadUrl:
            "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm",
    },
    {
        id: "gemma4-e4b-it",
        label: "Gemma 4 E4B Instruct",
        displayName: "Gemma4 e4b",
        format: "LiteRT-LM",
        baseModel: "google/gemma-4-E4B-it",
        repository: "litert-community/gemma-4-E4B-it-litert-lm",
        fileName: "gemma-4-E4B-it.litertlm",
        sizeBytes: 3_659_530_240,
        downloadUrl:
            "https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it.litertlm",
    },
] as const;

export type LocalTranslationModel = typeof LOCAL_TRANSLATION_MODELS[number];
export type LocalTranslationModelId = LocalTranslationModel["id"];
export type SelectedLocalTranslationModelId = LocalTranslationModelId | null;

export const DEFAULT_LOCAL_TRANSLATION_MODEL_ID: SelectedLocalTranslationModelId = null;
export const LOCAL_TRANSLATION_MODEL = LOCAL_TRANSLATION_MODELS[0];

let selectedLocalModelId: SelectedLocalTranslationModelId = DEFAULT_LOCAL_TRANSLATION_MODEL_ID;

export const getLocalTranslationModelById = (modelId: LocalTranslationModelId) => {
    return LOCAL_TRANSLATION_MODELS.find((model) => model.id === modelId) ?? LOCAL_TRANSLATION_MODEL;
};

export const getSelectedLocalTranslationModel = () => {
    return selectedLocalModelId ? getLocalTranslationModelById(selectedLocalModelId) : null;
};

export const setSelectedLocalTranslationModelId = (modelId: SelectedLocalTranslationModelId) => {
    selectedLocalModelId = modelId;
};

export type LocalModelStatus = {
    supported: boolean;
    isDownloaded: boolean;
    hasPartialDownload: boolean;
    modelUri: string | null;
    downloadedBytes: number;
    expectedBytes: number;
    availableBytes: number | null;
    progress: number;
};

export type LocalModelDownloadProgress = {
    downloadedBytes: number;
    expectedBytes: number;
    progress: number;
};

const getUnsupportedStatus = (modelId: LocalTranslationModelId): LocalModelStatus => ({
    supported: false,
    isDownloaded: false,
    hasPartialDownload: false,
    modelUri: null,
    downloadedBytes: 0,
    expectedBytes: getLocalTranslationModelById(modelId).sizeBytes,
    availableBytes: null,
    progress: 0,
});

export const isLocalModelSupported = (): boolean => false;

export const isLocalModelAbortError = (error: unknown) => {
    return error instanceof Error && error.name === "AbortError";
};

export const formatBytes = (bytes: number) => {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    const units = ["KB", "MB", "GB"];
    let value = bytes;
    let unitIndex = -1;

    do {
        value /= 1024;
        unitIndex += 1;
    } while (value >= 1024 && unitIndex < units.length - 1);

    return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
};

export const getLocalModelDirectoryUri = (): string | null => null;

export const getLocalModelFileUri = (_modelId?: SelectedLocalTranslationModelId): string | null => null;

export const getLocalModelStatus = async (
    modelId: LocalTranslationModelId
): Promise<LocalModelStatus> => getUnsupportedStatus(modelId);

export const isLocalModelDownloaded = async (_modelId?: SelectedLocalTranslationModelId): Promise<boolean> => false;

export const deleteLocalModel = async (_modelId?: SelectedLocalTranslationModelId) => undefined;

export const createLocalModelDownload = (
    _onProgress: (progress: LocalModelDownloadProgress) => void,
    _modelId: LocalTranslationModelId
) => {
    const start = async (): Promise<LocalModelStatus> => {
        throw new Error("Local models are available on iOS and Android only.");
    };

    const cancel = async () => undefined;

    return { start, cancel };
};
