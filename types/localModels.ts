export type LocalTranslationModelId = "gemma4-e2b-it" | "gemma4-e4b-it";
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
