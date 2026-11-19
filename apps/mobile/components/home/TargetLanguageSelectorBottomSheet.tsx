import { languages } from "@/constants/languages";
import { HOME_BOTTOM_SHEET_KEYS } from "@/constants/bottomSheets";
import useLanguageSelectionStore from '@/stores/languageSelectionStore';
import OptionSelectorSheet from "./OptionSelectorSheet";
import { triggerSelectionHaptic } from "@/lib/haptics";
import useHomeBottomSheetController from "@/hooks/useHomeBottomSheetController";

const targetLanguageOptions = Object.entries(languages);

function handleLanguageSelect(key: string) {
    const index = Number(key);
    const { selectedIndex1, selectLanguage } = useLanguageSelectionStore.getState();
    if (index === selectedIndex1) {
        return;
    }

    triggerSelectionHaptic();
    selectLanguage(false, index);
}

export default function TargetLanguageSelectorBottomSheet() {
    const { sheetRef, handleSheetClose, handleSheetChange } =
        useHomeBottomSheetController(HOME_BOTTOM_SHEET_KEYS.TARGET_LANGUAGE);
    const selectedIndex = useLanguageSelectionStore(state => state.selectedIndex1);

    return (
        <OptionSelectorSheet
            selectedKey={String(selectedIndex)}
            ref={sheetRef}
            onItemSelected={handleLanguageSelect}
            onClose={handleSheetClose}
            onChange={handleSheetChange}
            data={targetLanguageOptions}
        />
    );
}
