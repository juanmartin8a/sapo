import { Directory, File, Paths, type DownloadTask } from "expo-file-system";
import { Platform } from "react-native";
import {
    DEFAULT_LOCAL_TRANSLATION_MODEL_ID,
    getLocalTranslationModelById,
} from "@/constants/localModelCatalog";
import { ABORT_ERROR_NAME } from "@/constants/errors";
import { LOCAL_MODELS_MOBILE_ONLY_ERROR } from "@/constants/localModels";
import { formatBytes } from "@/utils/formatBytes";
import type {
    LocalModelDownloadProgress,
    LocalModelDownloadRecord,
    LocalModelStatus,
    LocalTranslationModel,
    LocalTranslationModelId,
    SelectedLocalTranslationModelId,
} from "@/types/localModels";

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

const createAbortError = (message: string) => {
    const error = new Error(message);
    error.name = ABORT_ERROR_NAME;
    return error;
};

const getFileSize = (file: File) => {
    return file.exists ? file.size : 0;
};

const getFileModificationTime = (file: File) => {
    return file.exists ? file.lastModified : null;
};

const normalizeHeaderValue = (value: string | undefined) => {
    return value?.trim().replace(/^W\//, "").replace(/^"|"$/g, "").toLowerCase();
};

const hasExpectedDownloadIntegrityHeader = (
    model: LocalTranslationModel,
    headers: Headers
) => {
    const linkedEtag = normalizeHeaderValue(headers.get("x-linked-etag") ?? undefined);
    const xetHash = normalizeHeaderValue(headers.get("x-xet-hash") ?? undefined);
    const etag = normalizeHeaderValue(headers.get("etag") ?? undefined);

    return linkedEtag === model.sha256 || xetHash === model.xetHash || etag === model.xetHash;
};

const assertDownloadResponseMatchesModel = (model: LocalTranslationModel, headers: Headers) => {
    if (!hasExpectedDownloadIntegrityHeader(model, headers)) {
        throw new Error("The model download response did not match the pinned model artifact.");
    }
};

const validateDownloadResponse = async (model: LocalTranslationModel, signal: AbortSignal) => {
    const response = await fetch(model.downloadUrl, { method: "HEAD", signal });

    if (!response.ok) {
        throw new Error(`Unable to validate the model download (status ${response.status}).`);
    }

    assertDownloadResponseMatchesModel(model, response.headers);
};

export const isLocalModelSupported = () => {
    return Platform.OS === "ios" || Platform.OS === "android";
};

export const isLocalModelAbortError = (error: unknown) => {
    return error instanceof Error && error.name === ABORT_ERROR_NAME;
};

const getLocalModelDirectory = () => {
    return new Directory(Paths.cache, MODEL_DIRECTORY_NAME);
};

const getLocalModelFile = (modelId: LocalTranslationModelId) => {
    return new File(getLocalModelDirectory(), getLocalTranslationModelById(modelId).fileName);
};

export const getLocalModelFileUri = (modelId: SelectedLocalTranslationModelId = selectedLocalModelId) => {
    if (!modelId) {
        return null;
    }

    return getLocalModelFile(modelId).uri;
};

const getPartialLocalModelFile = (modelId: LocalTranslationModelId) => {
    const model = getLocalTranslationModelById(modelId);
    return new File(getLocalModelDirectory(), `${model.fileName}${PARTIAL_DOWNLOAD_SUFFIX}`);
};

const getLocalModelDownloadRecordFile = (modelId: LocalTranslationModelId) => {
    const model = getLocalTranslationModelById(modelId);
    return new File(getLocalModelDirectory(), `${model.fileName}${VERIFICATION_FILE_SUFFIX}`);
};

const getFreeDiskStorage = async () => {
    try {
        return Paths.availableDiskSpace;
    } catch {
        return null;
    }
};

const readLocalModelDownloadRecord = async (
    model: LocalTranslationModel
): Promise<LocalModelDownloadRecord | null> => {
    const verificationFile = getLocalModelDownloadRecordFile(model.id);

    try {
        const verificationText = await verificationFile.text();
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
    modelFile?: File
) => {
    const resolvedModelFile = modelFile ?? getLocalModelFile(model.id);
    if (getFileSize(resolvedModelFile) !== model.sizeBytes) {
        return false;
    }

    const downloadRecord = await readLocalModelDownloadRecord(model);
    const fileModificationTime = getFileModificationTime(resolvedModelFile);

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
    modelFile?: File
) => {
    return hasTrustedLocalModelFile(model, modelFile);
};

const writeLocalModelDownloadRecord = async (
    model: LocalTranslationModel,
    modelFile: File
) => {
    const verificationFile = getLocalModelDownloadRecordFile(model.id);
    const fileModificationTime = getFileModificationTime(modelFile);

    if (fileModificationTime === null) {
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

    verificationFile.write(JSON.stringify(downloadRecord));
};

const ensureLocalModelDirectory = async () => {
    if (!isLocalModelSupported()) {
        throw new Error(LOCAL_MODELS_MOBILE_ONLY_ERROR);
    }

    const modelDirectory = getLocalModelDirectory();

    try {
        modelDirectory.create({ idempotent: true, intermediates: true });
    } catch (error) {
        if (!modelDirectory.exists) {
            throw new Error("Unable to create the local model folder.");
        }
        throw error;
    }

    return modelDirectory;
};

const finalizeLocalModelDownload = async (
    model: LocalTranslationModel,
    partialModelFile: File,
    modelFile: File
) => {
    if (getFileSize(partialModelFile) !== model.sizeBytes) {
        throw new Error("The downloaded model file was incomplete. Please try again.");
    }

    const verificationFile = getLocalModelDownloadRecordFile(model.id);

    if (modelFile.exists) {
        modelFile.delete();
    }
    if (verificationFile.exists) {
        verificationFile.delete();
    }
    await partialModelFile.move(modelFile);

    await writeLocalModelDownloadRecord(model, new File(modelFile.uri));
};

export const getLocalModelStatus = async (
    modelId: LocalTranslationModelId
): Promise<LocalModelStatus> => {
    const model = getLocalTranslationModelById(modelId);
    const supported = isLocalModelSupported();

    if (!supported) {
        return {
            supported,
            isDownloaded: false,
            downloadedBytes: 0,
            expectedBytes: model.sizeBytes,
            availableBytes: null,
        };
    }

    const modelFile = getLocalModelFile(model.id);
    const partialModelFile = getPartialLocalModelFile(model.id);
    const availableBytes = await getFreeDiskStorage();
    const modelBytes = getFileSize(modelFile);
    const partialBytes = getFileSize(partialModelFile);
    const isDownloaded = await isTrustedLocalModelFile(model, modelFile);

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

    if (!isLocalModelSupported()) {
        return false;
    }

    return isTrustedLocalModelFile(model);
};

export const deleteLocalModel = async (modelId: SelectedLocalTranslationModelId = selectedLocalModelId) => {
    if (!modelId) {
        return;
    }

    const modelFile = getLocalModelFile(modelId);
    const partialModelFile = getPartialLocalModelFile(modelId);
    const verificationFile = getLocalModelDownloadRecordFile(modelId);

    if (modelFile.exists) {
        modelFile.delete();
    }
    if (partialModelFile.exists) {
        partialModelFile.delete();
    }
    if (verificationFile.exists) {
        verificationFile.delete();
    }
};

export const createLocalModelDownload = (
    onProgress: (progress: LocalModelDownloadProgress) => void,
    modelId: LocalTranslationModelId
) => {
    const model = getLocalTranslationModelById(modelId);
    const abortController = new AbortController();
    let downloadTask: DownloadTask | null = null;
    let downloadPromise: Promise<File | null> | null = null;
    let isCancelled = false;

    const cancel = async () => {
        isCancelled = true;
        abortController.abort();

        if (downloadTask) {
            downloadTask.cancel();
        }
        if (downloadPromise) {
            await downloadPromise.catch(() => undefined);
        }

        const partialModelFile = getPartialLocalModelFile(model.id);
        if (partialModelFile.exists) {
            partialModelFile.delete();
        }
    };

    const start = async () => {
        if (!isLocalModelSupported()) {
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

        await validateDownloadResponse(model, abortController.signal);

        if (isCancelled) {
            throw createAbortError("Local model download cancelled.");
        }

        const modelFile = getLocalModelFile(model.id);
        const partialModelFile = getPartialLocalModelFile(model.id);

        downloadTask = File.createDownloadTask(
            model.downloadUrl,
            partialModelFile,
            {
                signal: abortController.signal,
                onProgress: (downloadProgress) => {
                    const expectedBytes = downloadProgress.totalBytes > 0
                        ? downloadProgress.totalBytes
                        : model.sizeBytes;
                    const progress = Math.min(1, downloadProgress.bytesWritten / expectedBytes);

                    onProgress({
                        downloadedBytes: downloadProgress.bytesWritten,
                        expectedBytes,
                        phase: progress >= 1 ? "finalizing" : "downloading",
                    });
                },
            }
        );

        downloadPromise = downloadTask.downloadAsync();
        let downloadedFile: File | null;

        try {
            downloadedFile = await downloadPromise;
        } finally {
            downloadPromise = null;
            downloadTask.release();
            downloadTask = null;
        }

        if (isCancelled || !downloadedFile) {
            throw createAbortError("Local model download cancelled.");
        }

        onProgress({
            downloadedBytes: model.sizeBytes,
            expectedBytes: model.sizeBytes,
            phase: "finalizing",
        });

        const partialModelBytes = getFileSize(downloadedFile);

        if (partialModelBytes !== model.sizeBytes) {
            downloadedFile.delete();
            throw new Error("The downloaded model file was incomplete. Please try again.");
        }

        if (isCancelled) {
            downloadedFile.delete();
            throw createAbortError("Local model download cancelled.");
        }

        await finalizeLocalModelDownload(model, downloadedFile, modelFile);

        return await getLocalModelStatus(model.id);
    };

    return { start, cancel };
};
