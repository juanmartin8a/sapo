import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import {
    DEFAULT_LOCAL_TRANSLATION_MODEL_ID,
    LOCAL_TRANSLATION_MODELS,
    formatBytes,
    getLocalTranslationModelById,
} from "@/clients/local-model-catalog";
import { ABORT_ERROR_NAME } from "@/constants/errors";
import { LOCAL_MODELS_MOBILE_ONLY_ERROR } from "@/constants/localModels";
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

const MODEL_DIRECTORY_NAME = "local-models";
const PARTIAL_DOWNLOAD_SUFFIX = ".download";
const VERIFICATION_FILE_SUFFIX = ".verified.json";
const LOW_STORAGE_BUFFER_BYTES = 512 * 1024 * 1024;

let selectedLocalModelId: SelectedLocalTranslationModelId = DEFAULT_LOCAL_TRANSLATION_MODEL_ID;

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
    downloadedBytes: number;
    expectedBytes: number;
    availableBytes: number | null;
};

export type LocalModelDownloadProgress = {
    downloadedBytes: number;
    expectedBytes: number;
    phase: "downloading" | "finalizing";
};

type LocalModelDownloadRecord = {
    modelId: LocalTranslationModelId;
    fileName: string;
    revision: string;
    sizeBytes: number;
    sha256: string;
    xetHash: string;
    fileModificationTime: number;
    verifiedAtMs: number;
};

const createAbortError = (message: string) => {
    const error = new Error(message);
    error.name = ABORT_ERROR_NAME;
    return error;
};

const getFileSize = (fileInfo: Awaited<ReturnType<typeof FileSystem.getInfoAsync>>) => {
    return fileInfo.exists && !fileInfo.isDirectory ? fileInfo.size ?? 0 : 0;
};

const getFileModificationTime = (fileInfo: Awaited<ReturnType<typeof FileSystem.getInfoAsync>>) => {
    return fileInfo.exists && !fileInfo.isDirectory ? fileInfo.modificationTime : null;
};

const normalizeHeaderValue = (value: string | undefined) => {
    return value?.trim().replace(/^W\//, "").replace(/^"|"$/g, "").toLowerCase();
};

const getHeaderValue = (headers: Record<string, string>, name: string) => {
    const headerName = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());

    return headerName ? headers[headerName] : undefined;
};

const hasExpectedDownloadIntegrityHeader = (
    model: LocalTranslationModel,
    headers: Record<string, string>
) => {
    const linkedEtag = normalizeHeaderValue(getHeaderValue(headers, "x-linked-etag"));
    const xetHash = normalizeHeaderValue(getHeaderValue(headers, "x-xet-hash"));
    const etag = normalizeHeaderValue(getHeaderValue(headers, "etag"));

    return linkedEtag === model.sha256 || xetHash === model.xetHash || etag === model.xetHash;
};

const assertDownloadResponseMatchesModel = (
    model: LocalTranslationModel,
    downloadResult: FileSystem.FileSystemDownloadResult
) => {
    if (!hasExpectedDownloadIntegrityHeader(model, downloadResult.headers)) {
        throw new Error("The model download response did not match the pinned model artifact.");
    }
};

export const isLocalModelSupported = () => {
    return Platform.OS === "ios" || Platform.OS === "android";
};

export const isLocalModelAbortError = (error: unknown) => {
    return error instanceof Error && error.name === ABORT_ERROR_NAME;
};

const getLocalModelDirectoryUri = () => {
    if (!FileSystem.cacheDirectory) {
        return null;
    }

    return `${FileSystem.cacheDirectory}${MODEL_DIRECTORY_NAME}/`;
};

const getLegacyDocumentLocalModelDirectoryUri = () => {
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

const getLocalModelDownloadRecordUri = (
    modelId: SelectedLocalTranslationModelId = selectedLocalModelId
) => {
    const modelFileUri = getLocalModelFileUri(modelId);

    if (!modelFileUri) {
        return null;
    }

    return `${modelFileUri}${VERIFICATION_FILE_SUFFIX}`;
};

const getLegacyDocumentLocalModelUris = () => {
    const legacyDocumentDirectoryUri = getLegacyDocumentLocalModelDirectoryUri();

    if (!legacyDocumentDirectoryUri) {
        return [] as string[];
    }

    return [
        ...LOCAL_TRANSLATION_MODELS.flatMap((model) => [
            `${legacyDocumentDirectoryUri}${model.fileName}`,
            `${legacyDocumentDirectoryUri}${model.fileName}${PARTIAL_DOWNLOAD_SUFFIX}`,
            `${legacyDocumentDirectoryUri}${model.fileName}${VERIFICATION_FILE_SUFFIX}`,
        ]),
        ...LEGACY_LOCAL_MODEL_FILE_NAMES.flatMap((fileName) => [
            `${legacyDocumentDirectoryUri}${fileName}`,
            `${legacyDocumentDirectoryUri}${fileName}${PARTIAL_DOWNLOAD_SUFFIX}`,
        ]),
    ];
};

const getFreeDiskStorage = async () => {
    try {
        return await FileSystem.getFreeDiskStorageAsync();
    } catch {
        return null;
    }
};

const readLocalModelDownloadRecord = async (
    model: LocalTranslationModel
): Promise<LocalModelDownloadRecord | null> => {
    const verificationUri = getLocalModelDownloadRecordUri(model.id);

    if (!verificationUri) {
        return null;
    }

    try {
        const verificationText = await FileSystem.readAsStringAsync(verificationUri);
        const parsedRecord = JSON.parse(verificationText) as Partial<LocalModelDownloadRecord>;

        if (
            parsedRecord.modelId === model.id &&
            parsedRecord.fileName === model.fileName &&
            parsedRecord.revision === model.revision &&
            parsedRecord.sizeBytes === model.sizeBytes &&
            parsedRecord.sha256 === model.sha256 &&
            parsedRecord.xetHash === model.xetHash
        ) {
            return parsedRecord as LocalModelDownloadRecord;
        }
    } catch {
        return null;
    }

    return null;
};

const hasTrustedLocalModelFile = async (
    model: LocalTranslationModel,
    modelInfo?: Awaited<ReturnType<typeof FileSystem.getInfoAsync>>
) => {
    const modelUri = getLocalModelFileUri(model.id);

    if (!modelUri) {
        return false;
    }

    const resolvedModelInfo = modelInfo ?? (await FileSystem.getInfoAsync(modelUri));
    if (getFileSize(resolvedModelInfo) !== model.sizeBytes) {
        return false;
    }

    const downloadRecord = await readLocalModelDownloadRecord(model);
    const fileModificationTime = getFileModificationTime(resolvedModelInfo);

    if (!downloadRecord) {
        return false;
    }

    if (fileModificationTime === null) {
        return false;
    }

    return Math.abs(downloadRecord.fileModificationTime - fileModificationTime) <= 1;
};

const isTrustedLocalModelFile = async (
    model: LocalTranslationModel,
    modelInfo?: Awaited<ReturnType<typeof FileSystem.getInfoAsync>>
) => {
    return hasTrustedLocalModelFile(model, modelInfo);
};

const writeLocalModelDownloadRecord = async (
    model: LocalTranslationModel,
    modelInfo: Awaited<ReturnType<typeof FileSystem.getInfoAsync>>
) => {
    const verificationUri = getLocalModelDownloadRecordUri(model.id);
    const fileModificationTime = getFileModificationTime(modelInfo);

    if (!verificationUri || fileModificationTime === null) {
        throw new Error("Unable to write local model download record.");
    }

    const downloadRecord: LocalModelDownloadRecord = {
        modelId: model.id,
        fileName: model.fileName,
        revision: model.revision,
        sizeBytes: model.sizeBytes,
        sha256: model.sha256,
        xetHash: model.xetHash,
        fileModificationTime,
        verifiedAtMs: Date.now(),
    };

    await FileSystem.writeAsStringAsync(verificationUri, JSON.stringify(downloadRecord));
};

const ensureLocalModelDirectory = async () => {
    const modelDirectoryUri = getLocalModelDirectoryUri();

    if (!isLocalModelSupported() || !modelDirectoryUri) {
        throw new Error(LOCAL_MODELS_MOBILE_ONLY_ERROR);
    }

    await FileSystem.makeDirectoryAsync(modelDirectoryUri, { intermediates: true }).catch(async () => {
        const directoryInfo = await FileSystem.getInfoAsync(modelDirectoryUri);
        if (!directoryInfo.exists || !directoryInfo.isDirectory) {
            throw new Error("Unable to create the local model folder.");
        }
    });

    return modelDirectoryUri;
};

const finalizeLocalModelDownload = async (
    model: LocalTranslationModel,
    partialModelUri: string,
    modelUri: string
) => {
    const partialModelInfo = await FileSystem.getInfoAsync(partialModelUri);

    if (getFileSize(partialModelInfo) !== model.sizeBytes) {
        throw new Error("The downloaded model file was incomplete. Please try again.");
    }

    const verificationUri = getLocalModelDownloadRecordUri(model.id);

    await Promise.all([
        FileSystem.deleteAsync(modelUri, { idempotent: true }).catch(() => undefined),
        verificationUri ? FileSystem.deleteAsync(verificationUri, { idempotent: true }).catch(() => undefined) : Promise.resolve(),
    ]);
    await FileSystem.moveAsync({ from: partialModelUri, to: modelUri });

    const modelInfo = await FileSystem.getInfoAsync(modelUri);
    await writeLocalModelDownloadRecord(model, modelInfo);
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
            downloadedBytes: 0,
            expectedBytes: model.sizeBytes,
            availableBytes: null,
        };
    }

    const [modelInfo, partialModelInfo, availableBytes] = await Promise.all([
        FileSystem.getInfoAsync(modelUri),
        FileSystem.getInfoAsync(partialModelUri),
        getFreeDiskStorage(),
    ]);
    const modelBytes = getFileSize(modelInfo);
    const partialBytes = getFileSize(partialModelInfo);
    const isDownloaded = await isTrustedLocalModelFile(model, modelInfo);

    const downloadedBytes = isDownloaded ? modelBytes : partialBytes;

    return {
        supported,
        isDownloaded,
        downloadedBytes,
        expectedBytes: model.sizeBytes,
        availableBytes,
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

    return isTrustedLocalModelFile(model);
};

export const deleteLocalModel = async (modelId: SelectedLocalTranslationModelId = selectedLocalModelId) => {
    if (!modelId) {
        return;
    }

    const model = getLocalTranslationModelById(modelId);
    const modelUri = getLocalModelFileUri(model.id);
    const partialModelUri = getPartialLocalModelFileUri(model.id);
    const verificationModelUri = getLocalModelDownloadRecordUri(model.id);
    const modelDirectoryUri = getLocalModelDirectoryUri();
    const legacyModelUris = modelDirectoryUri
        ? LEGACY_LOCAL_MODEL_FILE_NAMES.flatMap((fileName) => [
            `${modelDirectoryUri}${fileName}`,
            `${modelDirectoryUri}${fileName}${PARTIAL_DOWNLOAD_SUFFIX}`,
        ])
        : [];
    const legacyDocumentModelUris = getLegacyDocumentLocalModelUris();

    await Promise.all([
        modelUri ? FileSystem.deleteAsync(modelUri, { idempotent: true }) : Promise.resolve(),
        partialModelUri ? FileSystem.deleteAsync(partialModelUri, { idempotent: true }) : Promise.resolve(),
        verificationModelUri ? FileSystem.deleteAsync(verificationModelUri, { idempotent: true }) : Promise.resolve(),
        ...legacyModelUris.map((uri) => FileSystem.deleteAsync(uri, { idempotent: true })),
        ...legacyDocumentModelUris.map((uri) => FileSystem.deleteAsync(uri, { idempotent: true })),
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
        throw new Error(LOCAL_MODELS_MOBILE_ONLY_ERROR);
        }

        await ensureLocalModelDirectory();
        const existingStatus = await getLocalModelStatus(model.id);

        if (existingStatus.isDownloaded) {
            return existingStatus;
        }

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
                const progress = Math.min(1, downloadProgress.totalBytesWritten / expectedBytes);

                onProgress({
                    downloadedBytes: downloadProgress.totalBytesWritten,
                    expectedBytes,
                    phase: progress >= 1 ? "finalizing" : "downloading",
                });
            }
        );

        const downloadResult = await downloadTask.downloadAsync();

        if (isCancelled || !downloadResult) {
            throw createAbortError("Local model download cancelled.");
        }

        if (downloadResult.status < 200 || downloadResult.status >= 300) {
            await FileSystem.deleteAsync(partialModelUri, { idempotent: true }).catch(() => undefined);
            throw new Error(`Model download failed with status ${downloadResult.status}.`);
        }

        onProgress({
            downloadedBytes: model.sizeBytes,
            expectedBytes: model.sizeBytes,
            phase: "finalizing",
        });

        try {
            assertDownloadResponseMatchesModel(model, downloadResult);
        } catch (error) {
            await FileSystem.deleteAsync(partialModelUri, { idempotent: true }).catch(() => undefined);
            throw error;
        }

        const partialModelInfo = await FileSystem.getInfoAsync(partialModelUri);
        const partialModelBytes = getFileSize(partialModelInfo);

        if (partialModelBytes !== model.sizeBytes) {
            await FileSystem.deleteAsync(partialModelUri, { idempotent: true }).catch(() => undefined);
            throw new Error("The downloaded model file was incomplete. Please try again.");
        }

        if (isCancelled) {
            await FileSystem.deleteAsync(partialModelUri, { idempotent: true }).catch(() => undefined);
            throw createAbortError("Local model download cancelled.");
        }

        await finalizeLocalModelDownload(model, partialModelUri, modelUri);

        return await getLocalModelStatus(model.id);
    };

    return { start, cancel };
};
