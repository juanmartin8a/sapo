import { languagesPlusAutoDetect } from "@/constants/languages";
import { HOME_BOTTOM_SHEET_KEYS } from "@/constants/bottomSheets";
import useLanguageSelectionStore from '@/stores/languageSelectionStore';
import OptionSelectorSheet from "./OptionSelectorSheet";
import { triggerSelectionHaptic } from "@/lib/haptics";
import useHomeBottomSheetController from "@/hooks/useHomeBottomSheetController";

const sourceLanguageOptions = Object.entries(languagesPlusAutoDetect);

function handleLanguageSelect(key: string) {
    const index = Number(key);
    const { selectedIndex0, selectLanguage } = useLanguageSelectionStore.getState();
    if (index === selectedIndex0) {
        return;
    }

    triggerSelectionHaptic();
    selectLanguage(true, index);
}

export default function SourceLanguageSelectorBottomSheet() {
    const { sheetRef, handleSheetClose, handleSheetChange } =
        useHomeBottomSheetController(HOME_BOTTOM_SHEET_KEYS.INPUT_LANGUAGE);
    const selectedIndex = useLanguageSelectionStore(state => state.selectedIndex0);

    return (
        <OptionSelectorSheet
            selectedKey={String(selectedIndex)}
            ref={sheetRef}
            onItemSelected={handleLanguageSelect}
            onClose={handleSheetClose}
            onChange={handleSheetChange}
            data={sourceLanguageOptions}
        />
    );
}
