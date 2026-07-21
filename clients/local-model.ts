import {
    DEFAULT_LOCAL_TRANSLATION_MODEL_ID,
    LOCAL_TRANSLATION_MODELS,
    formatBytes,
    getLocalTranslationModelById,
} from "@/clients/local-model-catalog";
import type {
    LocalTranslationModel,
    LocalTranslationModelId,
    SelectedLocalTranslationModelId,
} from "@/clients/local-model-catalog";

export {
    DEFAULT_LOCAL_TRANSLATION_MODEL_ID,
    LOCAL_TRANSLATION_MODELS,
    formatBytes,
    getLocalTranslationModelById,
};
export type {
    LocalTranslationModel,
    LocalTranslationModelId,
    SelectedLocalTranslationModelId,
};

let selectedLocalModelId: SelectedLocalTranslationModelId = DEFAULT_LOCAL_TRANSLATION_MODEL_ID;

export const getSelectedLocalTranslationModel = () => {
    return selectedLocalModelId ? getLocalTranslationModelById(selectedLocalModelId) : null;
};

export const setSelectedLocalTranslationModelId = (modelId: SelectedLocalTranslationModelId) => {
    selectedLocalModelId = modelId;
};

export type LocalModelStatus = {
    supported: boolean;
    isDownloaded: boolean;
    downloadedBytes: number;
    expectedBytes: number;
    availableBytes: number | null;
};

export type LocalModelDownloadProgress = {
    downloadedBytes: number;
    expectedBytes: number;
    phase: "downloading" | "finalizing";
};

const getUnsupportedStatus = (modelId: LocalTranslationModelId): LocalModelStatus => ({
    supported: false,
    isDownloaded: false,
    downloadedBytes: 0,
    expectedBytes: getLocalTranslationModelById(modelId).sizeBytes,
    availableBytes: null,
});

export const isLocalModelSupported = (): boolean => false;

export const isLocalModelAbortError = (error: unknown) => {
    return error instanceof Error && error.name === "AbortError";
};

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
