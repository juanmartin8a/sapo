import { getLocalTranslationModelById } from "@/constants/localModelCatalog";
import type {
    LocalModelDownloadProgress,
    LocalModelStatus,
    LocalTranslationModelId,
    SelectedLocalTranslationModelId,
} from "@/types/localModels";
import { ABORT_ERROR_NAME } from "@/constants/errors";
import { LOCAL_MODELS_MOBILE_ONLY_ERROR } from "@/constants/localModels";

export const setSelectedLocalTranslationModelId = (_modelId: SelectedLocalTranslationModelId) => {};

const getUnsupportedStatus = (modelId: LocalTranslationModelId): LocalModelStatus => ({
    supported: false,
    isDownloaded: false,
    downloadedBytes: 0,
    expectedBytes: getLocalTranslationModelById(modelId).sizeBytes,
    availableBytes: null,
});

export const isLocalModelSupported = (): boolean => false;

export const isLocalModelAbortError = (error: unknown) => {
    return error instanceof Error && error.name === ABORT_ERROR_NAME;
};

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
        throw new Error(LOCAL_MODELS_MOBILE_ONLY_ERROR);
    };

    const cancel = async () => undefined;

    return { start, cancel };
};
