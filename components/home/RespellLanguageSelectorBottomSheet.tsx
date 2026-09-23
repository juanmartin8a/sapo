import { languages } from "@/constants/languages";
import { HOME_BOTTOM_SHEET_KEYS } from "@/constants/bottomSheets";
import useLanguageSelectionStore from "@/stores/languageSelectionStore";
import OptionSelectorSheet from "./OptionSelectorSheet";
import { triggerSelectionHaptic } from "@/lib/haptics";
import useHomeBottomSheetController from "@/hooks/useHomeBottomSheetController";

export default function RespellLanguageSelectorBottomSheet() {
    const { sheetRef, handleSheetClose, handleSheetChange } =
        useHomeBottomSheetController(HOME_BOTTOM_SHEET_KEYS.RESPELL_LANGUAGE);
    const selected = useLanguageSelectionStore(state => state.respellLanguage);
    return <OptionSelectorSheet
        ref={sheetRef}
        selectedKey={selected}
        data={["Source", ...Object.values(languages)].map(language => [language, language])}
        onItemSelected={language => {
            if (language !== selected) {
                triggerSelectionHaptic();
                useLanguageSelectionStore.getState().selectRespellLanguage(language);
            }
        }}
        onClose={handleSheetClose}
        onChange={handleSheetChange}
    />;
}
