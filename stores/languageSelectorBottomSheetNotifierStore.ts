import { create } from 'zustand';

interface LanguageSelectionNotifierProps {
    selectedIndex0: number,
    selectedIndex1: number,

    selectLanguage: (forInput: boolean, index: number) => void,
}

const useLanguageSelectionNotifier = create<LanguageSelectionNotifierProps>((set, get) => ({
    selectedIndex0: 0, // for input languages
    selectedIndex1: 1, // for target languages

    selectLanguage: (forInput: boolean, index: number) => {
        if (forInput) {
            return set({ selectedIndex0: index })
        }
        return set({ selectedIndex1: index })
    },
}))

export default useLanguageSelectionNotifier;
