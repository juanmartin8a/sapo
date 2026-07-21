import { HOME_BOTTOM_SHEET_KEYS } from "@/constants/bottomSheets";

export type LanguageSelectorBottomSheetKey =
    | typeof HOME_BOTTOM_SHEET_KEYS.INPUT_LANGUAGE
    | typeof HOME_BOTTOM_SHEET_KEYS.TARGET_LANGUAGE;

export type LocalModelSelectorBottomSheetKey = typeof HOME_BOTTOM_SHEET_KEYS.LOCAL_MODEL;

export type HomeBottomSheetKey = LanguageSelectorBottomSheetKey | LocalModelSelectorBottomSheetKey;
