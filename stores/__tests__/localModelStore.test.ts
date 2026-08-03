import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import type {
    LocalModelStatus,
    LocalTranslationModelId,
} from "@/types/localModels";
import useLocalModelStore from "@/stores/localModelStore";

const mockDownloadStart = jest.fn<(
    modelId: LocalTranslationModelId
) => Promise<LocalModelStatus>>();
const mockDownloadCancel = jest.fn<() => Promise<void>>();
const mockDeleteLocalModel = jest.fn<(
    modelId: LocalTranslationModelId
) => Promise<void>>();

jest.mock("@/lib/local-model", () => ({
    createLocalModelDownload: jest.fn((
        _onProgress: unknown,
        modelId: LocalTranslationModelId
    ) => ({
        start: () => mockDownloadStart(modelId),
        cancel: () => mockDownloadCancel(),
    })),
    deleteLocalModel: (modelId: LocalTranslationModelId) => mockDeleteLocalModel(modelId),
    isLocalModelDownloaded: jest.fn(),
    setSelectedLocalTranslationModelId: jest.fn(),
}));

jest.mock("@/lib/local-translation", () => ({
    ensureLocalTranslationModelLoaded: jest.fn(),
    getLoadedLocalTranslationModelId: jest.fn(() => null),
    runWithLocalTranslationModelReleased: jest.fn((
        _modelId: LocalTranslationModelId,
        operation: () => Promise<void>
    ) => operation()),
}));

const DOWNLOADING_MODEL_ID = "gemma4-e2b-it";
const DELETING_MODEL_ID = "gemma4-e4b-it";
const downloadedStatus: LocalModelStatus = {
    supported: true,
    isDownloaded: true,
    downloadedBytes: 2_588_147_712,
    expectedBytes: 2_588_147_712,
    availableBytes: 10_000_000_000,
};

const createDeferred = <Value,>() => {
    let resolve!: (value: Value) => void;
    const promise = new Promise<Value>((resolvePromise) => {
        resolve = resolvePromise;
    });

    return { promise, resolve };
};

describe("local model operation concurrency", () => {
    beforeEach(() => {
        mockDownloadStart.mockReset();
        mockDownloadCancel.mockReset();
        mockDeleteLocalModel.mockReset();
        useLocalModelStore.setState({
            selectedModelId: DELETING_MODEL_ID,
            downloadedModelIds: [DELETING_MODEL_ID],
            downloadProgressByModelId: {},
            downloadingModelId: null,
            deletingModelId: null,
            hasUserSelectedModel: false,
            isDownloaded: true,
            isEnabled: false,
            isLoaded: false,
            isLoading: false,
            loadingModelId: null,
            loadedModelId: null,
            isRefreshing: false,
        });
    });

    it("downloads one model while deleting another", async () => {
        const download = createDeferred<LocalModelStatus>();
        const deletion = createDeferred<void>();
        mockDownloadStart.mockReturnValue(download.promise);
        mockDeleteLocalModel.mockReturnValue(deletion.promise);

        const deletePromise = useLocalModelStore.getState().deleteModel(DELETING_MODEL_ID);
        const downloadPromise = useLocalModelStore.getState().startDownload(DOWNLOADING_MODEL_ID);

        expect(useLocalModelStore.getState()).toMatchObject({
            deletingModelId: DELETING_MODEL_ID,
            downloadingModelId: DOWNLOADING_MODEL_ID,
        });

        download.resolve(downloadedStatus);
        await downloadPromise;
        expect(useLocalModelStore.getState()).toMatchObject({
            deletingModelId: DELETING_MODEL_ID,
            downloadingModelId: null,
        });

        deletion.resolve();
        await deletePromise;
        expect(useLocalModelStore.getState()).toMatchObject({
            deletingModelId: null,
            downloadingModelId: null,
            downloadedModelIds: [DOWNLOADING_MODEL_ID],
        });
    });

    it("keeps one operation of each type and blocks same-model overlap", async () => {
        const download = createDeferred<LocalModelStatus>();
        const deletion = createDeferred<void>();
        mockDownloadStart.mockReturnValue(download.promise);
        mockDeleteLocalModel.mockReturnValue(deletion.promise);

        const deletePromise = useLocalModelStore.getState().deleteModel(DELETING_MODEL_ID);

        await expect(
            useLocalModelStore.getState().startDownload(DELETING_MODEL_ID)
        ).resolves.toBeNull();
        const downloadPromise = useLocalModelStore.getState().startDownload(DOWNLOADING_MODEL_ID);

        await expect(
            useLocalModelStore.getState().startDownload(DELETING_MODEL_ID)
        ).resolves.toBeNull();
        await useLocalModelStore.getState().deleteModel(DELETING_MODEL_ID);

        expect(mockDownloadStart).toHaveBeenCalledTimes(1);
        expect(mockDeleteLocalModel).toHaveBeenCalledTimes(1);

        deletion.resolve();
        await deletePromise;
        await useLocalModelStore.getState().deleteModel(DOWNLOADING_MODEL_ID);
        expect(mockDeleteLocalModel).toHaveBeenCalledTimes(1);

        download.resolve(downloadedStatus);
        await downloadPromise;
    });
});
