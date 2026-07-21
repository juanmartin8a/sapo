import { languagesPlusAutoDetect } from "@/constants/languages";
import { HOME_BOTTOM_SHEET_KEYS } from "@/constants/bottomSheets";
import useLanguageSelectorBottomSheetNotifier from '@/stores/languageSelectionNotifierStore';
import LangugeSelectorBottomSheetUI from "./LanguageSelectorBottomSheetUI";
import { triggerSelectionHaptic } from "@/utils/haptics";
import useHomeBottomSheetController from "./useHomeBottomSheetController";

// Separated Component from TargetLanguageSelectorBottomSheet.tsx for simplicity
// Single component would require more logic which would make the code harder to understand and debug.

export default function SourceLangugeSelectorBottomSheet() {
    const { sheetRef, handleSheetClose, handleSheetChange } =
        useHomeBottomSheetController(HOME_BOTTOM_SHEET_KEYS.INPUT_LANGUAGE);
    const selectLanguage = useLanguageSelectorBottomSheetNotifier(state => state.selectLanguage);
    const selectedIndex = useLanguageSelectorBottomSheetNotifier(state => state.selectedIndex0);

    const handleLanguageSelect = (key: string) => {
        const index = parseInt(key);

        if (index !== selectedIndex) {
            triggerSelectionHaptic();
        }

        selectLanguage(
            true, // with auto detect (true) 
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
            data={Object.entries(languagesPlusAutoDetect)}
        />
    );
}
