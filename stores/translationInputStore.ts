import { create } from 'zustand';

interface TranslationInputStoreState {
    text: string;
    characterCount: number;
    hasText: boolean;

    setText: (text: string, characterCount: number) => void;
}

const useTranslationInputStore = create<TranslationInputStoreState>((set) => ({
    text: "",
    characterCount: 0,
    hasText: false,
    setText: (text: string, characterCount: number) => {
        set({ text, characterCount, hasText: text.trim().length > 0 })
    },
}))

export default useTranslationInputStore
