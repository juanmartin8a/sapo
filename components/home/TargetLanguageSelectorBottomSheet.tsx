import { languages } from "@/constants/languages";
import useLanguageSelectorBottomSheetNotifier from '@/stores/languageSelectionNotifierStore';
import LangugeSelectorBottomSheetUI from "./LanguageSelectorBottomSheetUI";
import { triggerSelectionHaptic } from "@/utils/haptics";
import useHomeBottomSheetController from "./useHomeBottomSheetController";

// Separated Component from SourceLanguageSelectorBottomSheet.tsx for simplicity
// Single component would require more logic which would make the code harder to understand and debug.

export default function TargetLanguageSelectorBottomSheet() {
    const { sheetRef, handleSheetClose, handleSheetChange } =
        useHomeBottomSheetController("target_lang_selector");
    const selectLanguage = useLanguageSelectorBottomSheetNotifier(state => state.selectLanguage);
    const selectedIndex = useLanguageSelectorBottomSheetNotifier(state => state.selectedIndex1);

    const handleLanguageSelect = (key: string) => {
        const index = parseInt(key);

        if (index !== selectedIndex) {
            triggerSelectionHaptic();
        }

        selectLanguage(
            false, // without auto detect (false)
            index
        );
    }

    return (
        <LangugeSelectorBottomSheetUI
            selectedKey={String(selectedIndex)}
            ref={sheetRef}
            onLanguageSelected={handleLanguageSelect}
            onClose={handleSheetClose}
            onChange={handleSheetChange}
            data={Object.entries(languages)}
        />
    );
}
