import {
    createLocalModelDownload,
    deleteLocalModel,
    isLocalModelDownloaded,
    setSelectedLocalTranslationModelId,
} from "@/lib/local-model";
import {
    DEFAULT_LOCAL_TRANSLATION_MODEL_ID,
    LOCAL_TRANSLATION_MODELS,
    getLocalTranslationModelById,
} from "@/constants/localModelCatalog";
import type {
    LocalModelDownloadProgress,
    LocalModelStatus,
    LocalTranslationModelId,
    SelectedLocalTranslationModelId,
} from "@/types/localModels";
import {
    ensureLocalTranslationModelLoaded,
    getLoadedLocalTranslationModelId,
    runWithLocalTranslationModelReleased,
} from "@/lib/local-translation";
import { create } from "zustand";

interface LocalModelStoreState {
    selectedModelId: SelectedLocalTranslationModelId;
    downloadedModelIds: LocalTranslationModelId[];
    downloadProgressByModelId: Partial<Record<LocalTranslationModelId, LocalModelDownloadProgress>>;
    downloadingModelId: LocalTranslationModelId | null;
    deletingModelId: LocalTranslationModelId | null;
    hasUserSelectedModel: boolean;
    isDownloaded: boolean;
    isEnabled: boolean;
    isLoaded: boolean;
    isLoading: boolean;
    loadingModelId: SelectedLocalTranslationModelId;
    loadedModelId: SelectedLocalTranslationModelId;
    isRefreshing: boolean;
    cancelDownload: () => Promise<void>;
    deleteModel: (modelId: LocalTranslationModelId) => Promise<void>;
    selectModel: (modelId: SelectedLocalTranslationModelId) => Promise<void>;
    refreshDownloadedStatus: () => Promise<boolean>;
    setDownloadedModelIds: (downloadedModelIds: LocalTranslationModelId[]) => Promise<void>;
    setLoaded: (isLoaded: boolean) => void;
    startDownload: (modelId: LocalTranslationModelId) => Promise<LocalModelStatus | null>;
    loadModel: () => Promise<void>;
    setEnabled: (isEnabled: boolean) => void;
}

let activeDownload: ReturnType<typeof createLocalModelDownload> | null = null;
let activeDownloadPromise: Promise<LocalModelStatus> | null = null;
let activeRefreshPromise: Promise<boolean> | null = null;
let activeStatusOperationCount = 0;
let selectionRequestId = 0;
let modelLoadRequestId = 0;

const getDownloadedModelIds = async () => {
    const downloadStatuses = await Promise.all(
        LOCAL_TRANSLATION_MODELS.map(async (model) => [model.id, await isLocalModelDownloaded(model.id)] as const)
    );

    return downloadStatuses
        .filter(([, isDownloaded]) => isDownloaded)
        .map(([modelId]) => modelId);
};

const getSelectionState = (
    downloadedModelIds: LocalTranslationModelId[],
    selectedModelId: SelectedLocalTranslationModelId,
    hasUserSelectedModel: boolean
) => {
    if (downloadedModelIds.length === 0) {
        return { selectedModelId: null, hasUserSelectedModel: false, isDownloaded: false };
    }

    if (downloadedModelIds.length === 1) {
        return { selectedModelId: downloadedModelIds[0], hasUserSelectedModel: false, isDownloaded: true };
    }

    if (hasUserSelectedModel && selectedModelId && downloadedModelIds.includes(selectedModelId)) {
        return { selectedModelId, hasUserSelectedModel, isDownloaded: true };
    }

    return { selectedModelId: null, hasUserSelectedModel: false, isDownloaded: false };
};

const useLocalModelStore = create<LocalModelStoreState>((set, get) => ({
    selectedModelId: DEFAULT_LOCAL_TRANSLATION_MODEL_ID,
    downloadedModelIds: [],
    downloadProgressByModelId: {},
    downloadingModelId: null,
    deletingModelId: null,
    hasUserSelectedModel: false,
    isDownloaded: false,
    isEnabled: false,
    isLoaded: false,
    isLoading: false,
    loadingModelId: null,
    loadedModelId: null,
    isRefreshing: false,
    cancelDownload: async () => {
        const download = activeDownload;

        if (!download) {
            return;
        }

        await download.cancel();

        if (activeDownload === download) {
            activeDownload = null;
            activeDownloadPromise = null;
        }

        set({
            downloadProgressByModelId: {},
            downloadingModelId: null,
        });
    },
    deleteModel: async (modelId) => {
        const { deletingModelId, downloadingModelId } = get();
        if (deletingModelId || downloadingModelId) {
            return;
        }

        set({ deletingModelId: modelId });

        try {
            await runWithLocalTranslationModelReleased(modelId, async () => {
                await deleteLocalModel(modelId);
            });

            const downloadedModelIds = get().downloadedModelIds.filter(
                (downloadedModelId) => downloadedModelId !== modelId
            );
            await get().setDownloadedModelIds(downloadedModelIds);
            const nextLoadedModelId = getLoadedLocalTranslationModelId();
            set((state) => ({
                loadedModelId: nextLoadedModelId,
                isLoaded: nextLoadedModelId === state.selectedModelId,
            }));
        } finally {
            if (get().deletingModelId === modelId) {
                set({ deletingModelId: null });
            }
        }
    },
    selectModel: async (modelId) => {
        const { selectedModelId } = get();

        if (selectedModelId === modelId) {
            return;
        }

        const requestId = ++selectionRequestId;
        activeStatusOperationCount += 1;
        setSelectedLocalTranslationModelId(modelId);
        set({
            selectedModelId: modelId,
            hasUserSelectedModel: true,
            isLoaded: get().loadedModelId === modelId,
            isRefreshing: true,
        });

        if (!modelId) {
            activeStatusOperationCount -= 1;
            set({
                isDownloaded: false,
                isRefreshing: activeStatusOperationCount > 0,
            });
            return;
        }

        try {
            const isDownloaded = await isLocalModelDownloaded(modelId);

            if (selectionRequestId !== requestId || get().selectedModelId !== modelId) {
                return;
            }

            set((state) => ({
                downloadedModelIds: isDownloaded && !state.downloadedModelIds.includes(modelId)
                    ? [...state.downloadedModelIds, modelId]
                    : state.downloadedModelIds,
                isDownloaded,
            }));
        } finally {
            activeStatusOperationCount = Math.max(0, activeStatusOperationCount - 1);
            set({ isRefreshing: activeStatusOperationCount > 0 });
        }
    },
    refreshDownloadedStatus: async () => {
        if (activeRefreshPromise) {
            return activeRefreshPromise;
        }

        activeStatusOperationCount += 1;
        set({ isRefreshing: true });

        const refreshPromise = (async () => {
            try {
                const downloadedModelIds = await getDownloadedModelIds();
                const { selectedModelId, hasUserSelectedModel } = get();
                const selectionState = getSelectionState(downloadedModelIds, selectedModelId, hasUserSelectedModel);
                const didSelectionChange = selectionState.selectedModelId !== selectedModelId;

                if (didSelectionChange) {
                    selectionRequestId += 1;
                    setSelectedLocalTranslationModelId(selectionState.selectedModelId);
                }

                set((state) => ({
                ...selectionState,
                downloadedModelIds,
                isLoaded: state.loadedModelId === selectionState.selectedModelId,
                isLoading: state.isLoading,
                }));

                return selectionState.isDownloaded;
            } finally {
                activeStatusOperationCount = Math.max(0, activeStatusOperationCount - 1);
                set({ isRefreshing: activeStatusOperationCount > 0 });
            }
        })();

        activeRefreshPromise = refreshPromise;

        try {
            return await refreshPromise;
        } finally {
            if (activeRefreshPromise === refreshPromise) {
                activeRefreshPromise = null;
            }
        }
    },
    setDownloadedModelIds: async (downloadedModelIds) => {
        const { selectedModelId, hasUserSelectedModel } = get();
        const selectionState = getSelectionState(downloadedModelIds, selectedModelId, hasUserSelectedModel);
        const didSelectionChange = selectionState.selectedModelId !== selectedModelId;

        if (didSelectionChange) {
            selectionRequestId += 1;
            setSelectedLocalTranslationModelId(selectionState.selectedModelId);
        }

        set((state) => ({
            ...selectionState,
            downloadedModelIds,
            isLoaded: state.loadedModelId === selectionState.selectedModelId,
            isLoading: state.isLoading,
        }));
    },
    setLoaded: (isLoaded) => {
        const loadedModelId = isLoaded ? getLoadedLocalTranslationModelId() : null;
        set((state) => ({
            loadedModelId,
            isLoaded: isLoaded && loadedModelId === state.selectedModelId,
        }));
    },
    startDownload: async (modelId) => {
        const { deletingModelId, downloadingModelId } = get();

        if (deletingModelId || downloadingModelId) {
            return downloadingModelId === modelId ? activeDownloadPromise : null;
        }

        const model = getLocalTranslationModelById(modelId);
        const download = createLocalModelDownload((progress) => {
            set((state) => ({
                downloadProgressByModelId: {
                    ...state.downloadProgressByModelId,
                    [modelId]: progress,
                },
            }));
        }, modelId);

        activeDownload = download;

        set((state) => ({
            downloadProgressByModelId: {
                ...state.downloadProgressByModelId,
                [modelId]: {
                    downloadedBytes: 0,
                    expectedBytes: model.sizeBytes,
                    phase: "downloading",
                },
            },
            downloadingModelId: modelId,
        }));

        const downloadPromise = (async () => {
            try {
                const nextStatus = await download.start();
                await get().setDownloadedModelIds(Array.from(new Set([...get().downloadedModelIds, modelId])));
                set((state) => ({
                    downloadProgressByModelId: {
                        ...state.downloadProgressByModelId,
                        [modelId]: undefined,
                    },
                }));

                return nextStatus;
            } catch (error) {
                set((state) => ({
                    downloadProgressByModelId: {
                        ...state.downloadProgressByModelId,
                        [modelId]: undefined,
                    },
                }));
                throw error;
            } finally {
                if (activeDownload === download) {
                    activeDownload = null;
                    activeDownloadPromise = null;
                    set({ downloadingModelId: null });
                }
            }
        })();

        activeDownloadPromise = downloadPromise;

        return downloadPromise;
    },
    loadModel: async () => {
        const {
            deletingModelId,
            selectedModelId,
            loadedModelId,
            isDownloaded,
            isLoading,
            loadingModelId,
        } = get();
        const isSelectedModelLoaded = selectedModelId === loadedModelId;

        if (
            deletingModelId ||
            (isLoading && loadingModelId === selectedModelId) ||
            isSelectedModelLoaded
        ) {
            return;
        }

        if (!selectedModelId || !isDownloaded) {
            set({ isLoaded: false });
            return;
        }

        const requestId = ++modelLoadRequestId;
        set({ isLoading: true, loadingModelId: selectedModelId });

        try {
            await ensureLocalTranslationModelLoaded(selectedModelId);

            if (modelLoadRequestId !== requestId) {
                return;
            }

            const nextLoadedModelId = getLoadedLocalTranslationModelId();
            set({
                loadedModelId: nextLoadedModelId,
                isLoaded: nextLoadedModelId === get().selectedModelId,
                isLoading: false,
                loadingModelId: null,
            });
        } catch (error) {
            if (modelLoadRequestId !== requestId) {
                return;
            }

            set({
                loadedModelId: getLoadedLocalTranslationModelId(),
                isLoaded: false,
                isLoading: false,
                loadingModelId: null,
            });
            throw error;
        }
    },
    setEnabled: (isEnabled) => {
        set({ isEnabled });
    },
}));

export default useLocalModelStore;
