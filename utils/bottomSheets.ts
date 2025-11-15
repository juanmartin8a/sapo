import { HomeBottomSheetKey, LanguageSelectorBottomSheetKey } from "@/types/bottomSheets";

const LANGUAGE_SELECTOR_VALUES = [
    "input_lang_selector",
    "target_lang_selector",
] as const;

export function isLanguageSelectorBottomSheetKey(
    value: HomeBottomSheetKey | undefined
): value is LanguageSelectorBottomSheetKey {
    return LANGUAGE_SELECTOR_VALUES.includes(value as any);
}
