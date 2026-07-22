import { languagesPlusAutoDetect } from "@/constants/languages";
import { HOME_BOTTOM_SHEET_KEYS } from "@/constants/bottomSheets";
import useLanguageSelectionStore from '@/stores/languageSelectionStore';
import OptionSelectorSheet from "./OptionSelectorSheet";
import { triggerSelectionHaptic } from "@/lib/haptics";
import useHomeBottomSheetController from "@/hooks/useHomeBottomSheetController";

// Separated Component from TargetLanguageSelectorBottomSheet.tsx for simplicity
// Single component would require more logic which would make the code harder to understand and debug.

export default function SourceLanguageSelectorBottomSheet() {
    const { sheetRef, handleSheetClose, handleSheetChange } =
        useHomeBottomSheetController(HOME_BOTTOM_SHEET_KEYS.INPUT_LANGUAGE);
    const selectLanguage = useLanguageSelectionStore(state => state.selectLanguage);
    const selectedIndex = useLanguageSelectionStore(state => state.selectedIndex0);

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
        <OptionSelectorSheet
            selectedKey={String(selectedIndex)}
            ref={sheetRef}
            onItemSelected={handleLanguageSelect}
            onClose={handleSheetClose}
            onChange={handleSheetChange}
            data={Object.entries(languagesPlusAutoDetect)}
        />
    );
}
