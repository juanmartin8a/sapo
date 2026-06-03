import {
    DEFAULT_LOCAL_TRANSLATION_MODEL_ID,
    LOCAL_TRANSLATION_MODELS,
    isLocalModelDownloaded,
    setSelectedLocalTranslationModelId,
    type LocalTranslationModelId,
    type SelectedLocalTranslationModelId,
} from "@/clients/local-model";
import { ensureLocalTranslationModelLoaded, getLoadedLocalTranslationModelId } from "@/clients/local-translation";
import { create } from "zustand";

interface LocalModelStoreState {
    selectedModelId: SelectedLocalTranslationModelId;
    downloadedModelIds: LocalTranslationModelId[];
    hasUserSelectedModel: boolean;
    isDownloaded: boolean;
    isEnabled: boolean;
    isLoaded: boolean;
    isLoading: boolean;
    loadedModelId: SelectedLocalTranslationModelId;
    isRefreshing: boolean;
    selectModel: (modelId: SelectedLocalTranslationModelId) => Promise<void>;
    refreshDownloadedStatus: () => Promise<boolean>;
    setDownloaded: (isDownloaded: boolean) => void;
    setDownloadedModelIds: (downloadedModelIds: LocalTranslationModelId[]) => Promise<void>;
    setLoaded: (isLoaded: boolean) => void;
    setLoading: (isLoading: boolean) => void;
    loadModel: () => Promise<void>;
    toggleEnabled: () => Promise<void>;
}

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
    hasUserSelectedModel: false,
    isDownloaded: false,
    isEnabled: false,
    isLoaded: false,
    isLoading: false,
    loadedModelId: null,
    isRefreshing: false,
    selectModel: async (modelId) => {
        const { selectedModelId } = get();

        if (selectedModelId === modelId) {
            return;
        }

        setSelectedLocalTranslationModelId(modelId);
        set({
            selectedModelId: modelId,
            hasUserSelectedModel: true,
            isLoaded: get().loadedModelId === modelId,
            isLoading: false,
            isRefreshing: true,
        });

        if (!modelId) {
            set({ isDownloaded: false, isRefreshing: false });
            return;
        }

        try {
            const isDownloaded = await isLocalModelDownloaded(modelId);

            set((state) => ({
                downloadedModelIds: isDownloaded && !state.downloadedModelIds.includes(modelId)
                    ? [...state.downloadedModelIds, modelId]
                    : state.downloadedModelIds,
                isDownloaded,
            }));
        } finally {
            set({ isRefreshing: false });
        }
    },
    refreshDownloadedStatus: async () => {
        set({ isRefreshing: true });

        try {
            const { selectedModelId, hasUserSelectedModel } = get();
            const downloadedModelIds = await getDownloadedModelIds();
            const selectionState = getSelectionState(downloadedModelIds, selectedModelId, hasUserSelectedModel);
            const didSelectionChange = selectionState.selectedModelId !== selectedModelId;

            if (didSelectionChange) {
                setSelectedLocalTranslationModelId(selectionState.selectedModelId);
            }

            set((state) => ({
                ...selectionState,
                downloadedModelIds,
                isLoaded: state.loadedModelId === selectionState.selectedModelId,
                isLoading: !didSelectionChange && selectionState.isDownloaded ? state.isLoading : false,
            }));

            return selectionState.isDownloaded;
        } finally {
            set({ isRefreshing: false });
        }
    },
    setDownloaded: (isDownloaded) => {
        set((state) => ({
            isDownloaded,
            isLoaded: isDownloaded ? state.isLoaded : false,
            isLoading: isDownloaded ? state.isLoading : false,
        }));
    },
    setDownloadedModelIds: async (downloadedModelIds) => {
        const { selectedModelId, hasUserSelectedModel } = get();
        const selectionState = getSelectionState(downloadedModelIds, selectedModelId, hasUserSelectedModel);
        const didSelectionChange = selectionState.selectedModelId !== selectedModelId;

        if (didSelectionChange) {
            setSelectedLocalTranslationModelId(selectionState.selectedModelId);
        }

        set((state) => ({
            ...selectionState,
            downloadedModelIds,
            isLoaded: state.loadedModelId === selectionState.selectedModelId,
            isLoading: !didSelectionChange && selectionState.isDownloaded ? state.isLoading : false,
        }));
    },
    setLoaded: (isLoaded) => {
        const loadedModelId = isLoaded ? getLoadedLocalTranslationModelId() : null;
        set((state) => ({
            loadedModelId,
            isLoaded: isLoaded && loadedModelId === state.selectedModelId,
        }));
    },
    setLoading: (isLoading) => {
        set({ isLoading });
    },
    loadModel: async () => {
        const { selectedModelId, loadedModelId, isDownloaded, isLoading } = get();
        const isSelectedModelLoaded = selectedModelId === loadedModelId;

        if (isLoading || isSelectedModelLoaded) {
            return;
        }

        if (!selectedModelId || !isDownloaded) {
            set({ isLoaded: false, isLoading: false });
            return;
        }

        set({ isLoading: true });

        try {
            await ensureLocalTranslationModelLoaded(selectedModelId);
            const nextLoadedModelId = getLoadedLocalTranslationModelId();
            set({
                loadedModelId: nextLoadedModelId,
                isLoaded: nextLoadedModelId === get().selectedModelId,
                isLoading: false,
            });
        } catch (error) {
            set({ isLoaded: false, isLoading: false });
            throw error;
        }
    },
    toggleEnabled: async () => {
        const { isEnabled } = get();

        set({ isEnabled: !isEnabled });
    },
}));

export default useLocalModelStore;
