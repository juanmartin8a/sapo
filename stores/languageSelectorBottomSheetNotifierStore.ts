import { create } from 'zustand';

interface LanguageSelectorBottomSheetNotifierProps {
    withAutoDetect: boolean,
    selectedIndex0: number,
    selectedIndex1: number,
}

const useLanguageSelectorBottomSheetNotifier = create<LanguageSelectorBottomSheetNotifierProps>((set) => ({
    withAutoDetect: false,
    selectedIndex0: 0, // for input languages
    selectedIndex1: 1, // for target languages
    showBottomSheet: (withAutoDetect: boolean) => {
        return set({withAutoDetect: withAutoDetect})
    },
    selectLanguage: (forInput: boolean, index: number) => {
        if (forInput) {
            return set({selectedIndex0: index})
        }
        return set({selectedIndex1: index})
    },
}))

export default useLanguageSelectorBottomSheetNotifier;
