export type LocalTranslationArgs = {
    inputLanguage: string;
    targetLanguage: string;
    input: string;
};

export type LocalTranslationOptions = {
    signal?: AbortSignal;
    onReady?: () => void;
    onToken?: (token: string) => void;
};
