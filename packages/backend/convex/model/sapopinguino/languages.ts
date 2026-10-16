export const RESPELL_LANGUAGES = [
    "English", "Spanish", "French", "Portuguese", "Mandarin Chinese", "Japanese",
    "Arabic", "German", "Korean", "Hindi", "Italian", "Russian", "Urdu",
    "Indonesian", "Turkish", "Swahili", "Polish", "Greek",
];
export const isRespellLanguage = (value: unknown): value is string =>
    typeof value === "string" && RESPELL_LANGUAGES.includes(value);
