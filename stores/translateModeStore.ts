import { create } from 'zustand';

export type TranslateMode = 'translate' | 'transliterate';

interface TranslateModeStoreProps {
    mode: TranslateMode;

    setMode: (mode: TranslateMode) => void;
}

const useTranslateModeStore = create<TranslateModeStoreProps>((set) => ({
    mode: 'transliterate',
    setMode: (mode: TranslateMode) => {
        set({ mode });
    },
}));

export default useTranslateModeStore;
