import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

const MODEL_DIRECTORY_NAME = "local-models";
const PARTIAL_DOWNLOAD_SUFFIX = ".download";
const LOW_STORAGE_BUFFER_BYTES = 512 * 1024 * 1024;

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

const LEGACY_LOCAL_MODEL_FILE_NAMES = [
    "gemma-4-E2B-it-Q4_K_M.gguf",
    "google_gemma-4-E4B-it-Q4_K_M.gguf",
    "google_gemma-3n-E4B-it-Q4_K_M.gguf",
];

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

const createAbortError = (message: string) => {
    const error = new Error(message);
    error.name = "AbortError";
    return error;
};

const getFileSize = (fileInfo: Awaited<ReturnType<typeof FileSystem.getInfoAsync>>) => {
    return fileInfo.exists && !fileInfo.isDirectory ? fileInfo.size ?? 0 : 0;
};

export const isLocalModelSupported = () => {
    return Platform.OS === "ios" || Platform.OS === "android";
};

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

export const getLocalModelDirectoryUri = () => {
    if (!FileSystem.documentDirectory) {
        return null;
    }

    return `${FileSystem.documentDirectory}${MODEL_DIRECTORY_NAME}/`;
};

export const getLocalModelFileUri = (modelId: SelectedLocalTranslationModelId = selectedLocalModelId) => {
    const modelDirectoryUri = getLocalModelDirectoryUri();

    if (!modelDirectoryUri || !modelId) {
        return null;
    }

    return `${modelDirectoryUri}${getLocalTranslationModelById(modelId).fileName}`;
};

const getPartialLocalModelFileUri = (modelId: SelectedLocalTranslationModelId = selectedLocalModelId) => {
    const modelFileUri = getLocalModelFileUri(modelId);

    if (!modelFileUri) {
        return null;
    }

    return `${modelFileUri}${PARTIAL_DOWNLOAD_SUFFIX}`;
};

const getFreeDiskStorage = async () => {
    try {
        return await FileSystem.getFreeDiskStorageAsync();
    } catch {
        return null;
    }
};

const ensureLocalModelDirectory = async () => {
    const modelDirectoryUri = getLocalModelDirectoryUri();

    if (!isLocalModelSupported() || !modelDirectoryUri) {
        throw new Error("Local models are available on iOS and Android only.");
    }

    await FileSystem.makeDirectoryAsync(modelDirectoryUri, { intermediates: true }).catch(async () => {
        const directoryInfo = await FileSystem.getInfoAsync(modelDirectoryUri);
        if (!directoryInfo.exists || !directoryInfo.isDirectory) {
            throw new Error("Unable to create the local model folder.");
        }
    });

    return modelDirectoryUri;
};

export const getLocalModelStatus = async (
    modelId: LocalTranslationModelId
): Promise<LocalModelStatus> => {
    const model = getLocalTranslationModelById(modelId);
    const supported = isLocalModelSupported();
    const modelUri = getLocalModelFileUri(model.id);
    const partialModelUri = getPartialLocalModelFileUri(model.id);

    if (!supported || !modelUri || !partialModelUri) {
        return {
            supported,
            isDownloaded: false,
            hasPartialDownload: false,
            modelUri: null,
            downloadedBytes: 0,
            expectedBytes: model.sizeBytes,
            availableBytes: null,
            progress: 0,
        };
    }

    const [modelInfo, partialModelInfo, availableBytes] = await Promise.all([
        FileSystem.getInfoAsync(modelUri),
        FileSystem.getInfoAsync(partialModelUri),
        getFreeDiskStorage(),
    ]);
    const modelBytes = getFileSize(modelInfo);
    const partialBytes = getFileSize(partialModelInfo);
    const isDownloaded = modelBytes === model.sizeBytes;
    const downloadedBytes = isDownloaded ? modelBytes : partialBytes;

    return {
        supported,
        isDownloaded,
        hasPartialDownload: !isDownloaded && partialBytes > 0,
        modelUri,
        downloadedBytes,
        expectedBytes: model.sizeBytes,
        availableBytes,
        progress: Math.min(1, downloadedBytes / model.sizeBytes),
    };
};

export const isLocalModelDownloaded = async (modelId: SelectedLocalTranslationModelId = selectedLocalModelId) => {
    if (!modelId) {
        return false;
    }

    const model = getLocalTranslationModelById(modelId);
    const modelUri = getLocalModelFileUri(model.id);

    if (!isLocalModelSupported() || !modelUri) {
        return false;
    }

    const modelInfo = await FileSystem.getInfoAsync(modelUri);
    return getFileSize(modelInfo) === model.sizeBytes;
};

export const deleteLocalModel = async (modelId: SelectedLocalTranslationModelId = selectedLocalModelId) => {
    if (!modelId) {
        return;
    }

    const model = getLocalTranslationModelById(modelId);
    const modelUri = getLocalModelFileUri(model.id);
    const partialModelUri = getPartialLocalModelFileUri(model.id);
    const modelDirectoryUri = getLocalModelDirectoryUri();
    const legacyModelUris = modelDirectoryUri
        ? LEGACY_LOCAL_MODEL_FILE_NAMES.flatMap((fileName) => [
            `${modelDirectoryUri}${fileName}`,
            `${modelDirectoryUri}${fileName}${PARTIAL_DOWNLOAD_SUFFIX}`,
        ])
        : [];

    await Promise.all([
        modelUri ? FileSystem.deleteAsync(modelUri, { idempotent: true }) : Promise.resolve(),
        partialModelUri ? FileSystem.deleteAsync(partialModelUri, { idempotent: true }) : Promise.resolve(),
        ...legacyModelUris.map((uri) => FileSystem.deleteAsync(uri, { idempotent: true })),
    ]);
};

export const createLocalModelDownload = (
    onProgress: (progress: LocalModelDownloadProgress) => void,
    modelId: LocalTranslationModelId
) => {
    const model = getLocalTranslationModelById(modelId);
    let downloadTask: ReturnType<typeof FileSystem.createDownloadResumable> | null = null;
    let isCancelled = false;

    const cancel = async () => {
        isCancelled = true;

        if (downloadTask) {
            await downloadTask.cancelAsync().catch(() => undefined);
        }

        const partialModelUri = getPartialLocalModelFileUri(model.id);
        if (partialModelUri) {
            await FileSystem.deleteAsync(partialModelUri, { idempotent: true }).catch(() => undefined);
        }
    };

    const start = async () => {
        const modelUri = getLocalModelFileUri(model.id);
        const partialModelUri = getPartialLocalModelFileUri(model.id);

        if (!modelUri || !partialModelUri) {
            throw new Error("Local models are available on iOS and Android only.");
        }

        await ensureLocalModelDirectory();
        await deleteLocalModel(model.id);

        const availableBytes = await getFreeDiskStorage();
        const requiredBytes = model.sizeBytes + LOW_STORAGE_BUFFER_BYTES;

        if (availableBytes !== null && availableBytes < requiredBytes) {
            throw new Error(
                `Not enough free storage. SAPO needs about ${formatBytes(requiredBytes)} available to download this model.`
            );
        }

        downloadTask = FileSystem.createDownloadResumable(
            model.downloadUrl,
            partialModelUri,
            {},
            (downloadProgress) => {
                const expectedBytes = downloadProgress.totalBytesExpectedToWrite > 0
                    ? downloadProgress.totalBytesExpectedToWrite
                    : model.sizeBytes;

                onProgress({
                    downloadedBytes: downloadProgress.totalBytesWritten,
                    expectedBytes,
                    progress: Math.min(1, downloadProgress.totalBytesWritten / expectedBytes),
                });
            }
        );

        const downloadResult = await downloadTask.downloadAsync();

        if (isCancelled || !downloadResult) {
            throw createAbortError("Local model download cancelled.");
        }

        if (downloadResult.status < 200 || downloadResult.status >= 300) {
            throw new Error(`Model download failed with status ${downloadResult.status}.`);
        }

        const partialModelInfo = await FileSystem.getInfoAsync(partialModelUri);
        const partialModelBytes = getFileSize(partialModelInfo);

        if (partialModelBytes !== model.sizeBytes) {
            await FileSystem.deleteAsync(partialModelUri, { idempotent: true }).catch(() => undefined);
            throw new Error("The downloaded model file was incomplete. Please try again.");
        }

        await FileSystem.moveAsync({ from: partialModelUri, to: modelUri });

        return await getLocalModelStatus(model.id);
    };

    return { start, cancel };
};
