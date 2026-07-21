import { create } from 'zustand';

import { DEFAULT_SOURCE_LANGUAGE_ID, DEFAULT_TARGET_LANGUAGE_ID } from "@/constants/languages";

interface LanguageSelectionNotifierProps {
    selectedIndex0: number,
    selectedIndex1: number,

    selectLanguage: (forInput: boolean, index: number) => void,
}

const useLanguageSelectionNotifier = create<LanguageSelectionNotifierProps>((set, get) => ({
    selectedIndex0: DEFAULT_SOURCE_LANGUAGE_ID, // for input languages
    selectedIndex1: DEFAULT_TARGET_LANGUAGE_ID, // for target languages

    selectLanguage: (forInput: boolean, index: number) => {
        if (forInput) {
            return set({ selectedIndex0: index })
        }
        return set({ selectedIndex1: index })
    },
}))

export default useLanguageSelectionNotifier;
