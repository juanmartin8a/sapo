import { languages } from "@/constants/languages";
import { HOME_BOTTOM_SHEET_KEYS } from "@/constants/bottomSheets";
import useLanguageSelectionStore from '@/stores/languageSelectionStore';
import OptionSelectorSheet from "./OptionSelectorSheet";
import { triggerSelectionHaptic } from "@/lib/haptics";
import useHomeBottomSheetController from "@/hooks/useHomeBottomSheetController";

// Separated Component from SourceLanguageSelectorBottomSheet.tsx for simplicity
// Single component would require more logic which would make the code harder to understand and debug.

export default function TargetLanguageSelectorBottomSheet() {
    const { sheetRef, handleSheetClose, handleSheetChange } =
        useHomeBottomSheetController(HOME_BOTTOM_SHEET_KEYS.TARGET_LANGUAGE);
    const selectLanguage = useLanguageSelectionStore(state => state.selectLanguage);
    const selectedIndex = useLanguageSelectionStore(state => state.selectedIndex1);

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
        <OptionSelectorSheet
            selectedKey={String(selectedIndex)}
            ref={sheetRef}
            onItemSelected={handleLanguageSelect}
            onClose={handleSheetClose}
            onChange={handleSheetChange}
            data={Object.entries(languages)}
        />
    );
}
