const AUTO_DETECT_LANGUAGE_ID = 0;
export const DEFAULT_SOURCE_LANGUAGE_ID = AUTO_DETECT_LANGUAGE_ID;
export const DEFAULT_TARGET_LANGUAGE_ID = 1;
export const AUTO_DETECT_LANGUAGE_LABEL = "Auto-detect";

export const languages = {
  1: "English",
  2: "Spanish",
  3: "French",
  4: "Portuguese",
  5: "Mandarin Chinese",
  6: "Japanese",
  7: "Arabic",
  8: "German",
  9: "Korean",
  10: "Hindi",
  11: "Italian",
  12: "Russian",
  13: "Urdu",
  14: "Indonesian",
  15: "Turkish",
  16: "Swahili",
  17: "Polish",
  18: "Greek",
} as const;


export const languagesPlusAutoDetect = {
    [AUTO_DETECT_LANGUAGE_ID]: AUTO_DETECT_LANGUAGE_LABEL,
    ...languages
};
