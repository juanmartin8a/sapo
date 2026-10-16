import { LOCAL_TRANSLATION_MODEL_IDS } from "@/constants/localModels";

export type LocalTranslationModelId =
    (typeof LOCAL_TRANSLATION_MODEL_IDS)[keyof typeof LOCAL_TRANSLATION_MODEL_IDS];
export type SelectedLocalTranslationModelId = LocalTranslationModelId | null;

export type LocalTranslationModel = {
    readonly id: LocalTranslationModelId;
    readonly displayName: string;
    readonly fileName: string;
    readonly revision: string;
    readonly sizeBytes: number;
    readonly sha256: string;
    readonly xetHash: string;
    readonly downloadUrl: string;
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

export type LocalModelDownloadRecord = {
    modelId: LocalTranslationModelId;
    fileName: string;
    revision: string;
    sizeBytes: number;
    sha256: string;
    xetHash: string;
    fileModificationTime: number;
    verifiedAtMs: number;
};
