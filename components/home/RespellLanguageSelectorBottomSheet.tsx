import { languages } from "@/constants/languages";
import { HOME_BOTTOM_SHEET_KEYS } from "@/constants/bottomSheets";
import useLanguageSelectionStore from "@/stores/languageSelectionStore";
import OptionSelectorSheet from "./OptionSelectorSheet";
import { triggerSelectionHaptic } from "@/lib/haptics";
import useHomeBottomSheetController from "@/hooks/useHomeBottomSheetController";

const respellLanguageOptions: [string, string][] = ["Source", ...Object.values(languages)]
    .map(language => [language, language]);

export default function RespellLanguageSelectorBottomSheet() {
    const { sheetRef, handleSheetClose, handleSheetChange } =
        useHomeBottomSheetController(HOME_BOTTOM_SHEET_KEYS.RESPELL_LANGUAGE);
    const selected = useLanguageSelectionStore(state => state.respellLanguage);
    const selectRespellLanguage = useLanguageSelectionStore(state => state.selectRespellLanguage);

    const handleLanguageSelect = (language: string) => {
        if (language === selected) {
            return;
        }

        triggerSelectionHaptic();
        selectRespellLanguage(language);
    };

    return (
        <OptionSelectorSheet
            ref={sheetRef}
            selectedKey={selected}
            data={respellLanguageOptions}
            onItemSelected={handleLanguageSelect}
            onClose={handleSheetClose}
            onChange={handleSheetChange}
        />
    );
}
