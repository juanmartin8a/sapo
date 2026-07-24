import { create } from 'zustand';

import { DEFAULT_SOURCE_LANGUAGE_ID, DEFAULT_TARGET_LANGUAGE_ID } from "@/constants/languages";

interface LanguageSelectionStoreState {
    selectedIndex0: number,
    selectedIndex1: number,

    selectLanguage: (forInput: boolean, index: number) => void,
}

const useLanguageSelectionStore = create<LanguageSelectionStoreState>((set) => ({
    selectedIndex0: DEFAULT_SOURCE_LANGUAGE_ID, // for input languages
    selectedIndex1: DEFAULT_TARGET_LANGUAGE_ID, // for target languages

    selectLanguage: (forInput: boolean, index: number) => {
        if (forInput) {
            return set({ selectedIndex0: index })
        }
        return set({ selectedIndex1: index })
    },
}))

export default useLanguageSelectionStore;
