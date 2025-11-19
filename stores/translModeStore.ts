import { create } from 'zustand';

export type TranslMode = 'translate' | 'transliterate';

interface TranslateModeStoreProps {
    mode: TranslMode;
    inputLimit: number;

    setMode: (mode: TranslMode) => void;
}

const useTranslModeStore = create<TranslateModeStoreProps>((set) => ({
    mode: 'transliterate',
    inputLimit: 1000,
    setMode: (mode: TranslMode) => {
        set({ mode });
    },
}));

export default useTranslModeStore;
