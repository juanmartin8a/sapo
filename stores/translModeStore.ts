import { create } from 'zustand';

export type TranslMode = 'translate' | 'transliterate';

interface TranslateModeStoreProps {
    mode: TranslMode;

    setMode: (mode: TranslMode) => void;
}

const useTranslModeStore = create<TranslateModeStoreProps>((set) => ({
    mode: 'transliterate',
    setMode: (mode: TranslMode) => {
        set({ mode });
    },
}));

export default useTranslModeStore;
