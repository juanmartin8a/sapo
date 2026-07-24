export type LocalTranslationArgs = {
    inputLanguage: string;
    targetLanguage: string;
    input: string;
};

export type LocalTranslationOptions = {
    signal?: AbortSignal;
    onToken?: (token: string) => void;
};
