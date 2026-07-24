const AUTO_DETECT_LANGUAGE_ID = 0;
export const DEFAULT_SOURCE_LANGUAGE_ID = AUTO_DETECT_LANGUAGE_ID;
export const DEFAULT_TARGET_LANGUAGE_ID = 1;
export const AUTO_DETECT_LANGUAGE_LABEL = "Auto-detect";

export const languages = {
    1: "English",
    2: "Spanish",
    3: "French",
    4: "German",
    5: "Russian",
    6: "Arabic",
    7: "Mandarin (Standard Chinese)",
    8: "Japanese",
}


export const languagesPlusAutoDetect = {
    [AUTO_DETECT_LANGUAGE_ID]: AUTO_DETECT_LANGUAGE_LABEL,
    ...languages
};
