import {
    DEFAULT_LOCAL_TRANSLATION_MODEL_ID,
    isLocalModelDownloaded,
    setSelectedLocalTranslationModelId,
    type SelectedLocalTranslationModelId,
} from "@/clients/local-model";
import { ensureLocalTranslationModelLoaded, releaseLocalTranslationModel } from "@/clients/local-translation";
import { create } from "zustand";

interface LocalModelStoreState {
    selectedModelId: SelectedLocalTranslationModelId;
    isDownloaded: boolean;
    isEnabled: boolean;
    isLoaded: boolean;
    isLoading: boolean;
    isRefreshing: boolean;
    selectModel: (modelId: SelectedLocalTranslationModelId) => Promise<void>;
    refreshDownloadedStatus: () => Promise<boolean>;
    setDownloaded: (isDownloaded: boolean) => void;
    setLoaded: (isLoaded: boolean) => void;
    setLoading: (isLoading: boolean) => void;
    loadModel: () => Promise<void>;
    toggleEnabled: () => Promise<void>;
}

const useLocalModelStore = create<LocalModelStoreState>((set, get) => ({
    selectedModelId: DEFAULT_LOCAL_TRANSLATION_MODEL_ID,
    isDownloaded: false,
    isEnabled: false,
    isLoaded: false,
    isLoading: false,
    isRefreshing: false,
    selectModel: async (modelId) => {
        const { selectedModelId } = get();

        if (selectedModelId === modelId) {
            return;
        }

        setSelectedLocalTranslationModelId(modelId);
        set({
            selectedModelId: modelId,
            isLoaded: false,
            isLoading: false,
            isRefreshing: true,
        });
        await releaseLocalTranslationModel();

        if (!modelId) {
            set({ isDownloaded: false, isRefreshing: false });
            return;
        }

        try {
            const isDownloaded = await isLocalModelDownloaded(modelId);

            set({ isDownloaded });
        } finally {
            set({ isRefreshing: false });
        }
    },
    refreshDownloadedStatus: async () => {
        const { selectedModelId } = get();

        if (!selectedModelId) {
            set({ isDownloaded: false, isLoaded: false, isLoading: false, isRefreshing: false });
            return false;
        }

        set({ isRefreshing: true });

        try {
            const isDownloaded = await isLocalModelDownloaded(selectedModelId);

            set((state) => ({
                isDownloaded,
                isLoaded: isDownloaded ? state.isLoaded : false,
                isLoading: isDownloaded ? state.isLoading : false,
            }));

            return isDownloaded;
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
    setLoaded: (isLoaded) => {
        set({ isLoaded });
    },
    setLoading: (isLoading) => {
        set({ isLoading });
    },
    loadModel: async () => {
        const { selectedModelId, isDownloaded, isLoaded, isLoading } = get();

        if (isLoading || isLoaded) {
            return;
        }

        if (!selectedModelId || !isDownloaded) {
            set({ isLoaded: false, isLoading: false });
            return;
        }

        set({ isLoading: true });

        try {
            await ensureLocalTranslationModelLoaded();
            set({ isLoaded: true, isLoading: false });
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
