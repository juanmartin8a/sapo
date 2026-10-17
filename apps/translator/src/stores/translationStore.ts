import { createStore } from "solid-js";
import { DEFAULT_PREFERENCES, type Preferences } from "@/lib/preferences";
import { streamTranslation } from "@/lib/translation-stream";
import type {
    MobilePane,
    TranslationStatus,
    TranslationRequest,
} from "@/types/translation";

export function createTranslationStore() {
    const [state, setState] = createStore({
        ...DEFAULT_PREFERENCES,
        input: "",
        displayText: "",
        translationPreview: "",
        status: "idle" as TranslationStatus,
        error: null as string | null,
        mobilePane: "input" as MobilePane,
        mouthTriggerVersion: 0,
    });
    let activeController: AbortController | null = null;
    let lastRequest: TranslationRequest | null = null;

    function stopStream() {
        activeController?.abort();
        activeController = null;
        setState((draft) => {
            if (draft.status === "loading" || draft.status === "streaming")
                draft.status = "stopped";
        });
    }

    async function sendMessage(expectedUserId: string) {
        if (activeController || !state.input.trim()) return;
        const request: TranslationRequest = {
            operation: state.operation,
            inputLanguage: state.sourceLanguage,
            targetLanguage: state.targetLanguage,
            respellLanguage: state.respellLanguage,
            translateThenRespell:
                state.operation === "respell" && state.translateThenRespell,
            input: state.input,
        };
        lastRequest = request;
        const controller = new AbortController();
        activeController = controller;
        setState((draft) => {
            draft.displayText = "";
            draft.translationPreview = "";
            draft.error = null;
            draft.status = "loading";
            draft.mobilePane = "output";
        });
        try {
            await streamTranslation(
                request,
                controller,
                (token) => {
                    if (activeController !== controller) return;
                    setState((draft) => {
                        draft.status = "streaming";
                        if (token.type === "translation_preview")
                            draft.translationPreview += token.value ?? "";
                        else {
                            draft.displayText +=
                                token.type === "word"
                                    ? (token.output ?? "")
                                    : (token.value ?? "");
                            if (
                                token.type === "word" ||
                                token.type === "translate"
                            )
                                draft.mouthTriggerVersion++;
                        }
                    });
                },
                expectedUserId,
            );
            if (activeController === controller)
                setState((draft) => {
                    draft.status = "completed";
                });
        } catch (error) {
            if (activeController === controller)
                setState((draft) => {
                    draft.status = "error";
                    draft.error =
                        error instanceof Error
                            ? error.message
                            : "Something went wrong. Please try again.";
                });
        } finally {
            if (activeController === controller) activeController = null;
        }
    }

    return {
        state,
        setInput: (input: string) =>
            setState((draft) => {
                draft.input = input;
            }),
        setPreferences: (preferences: Partial<Preferences>) => {
            stopStream();
            setState((draft) => {
                Object.assign(draft, preferences);
                draft.error = null;
            });
        },
        setMobilePane: (pane: MobilePane) =>
            setState((draft) => {
                draft.mobilePane = pane;
            }),
        setError: (error: string | null) =>
            setState((draft) => {
                draft.error = error;
            }),
        swapLanguages: () => {
            stopStream();
            setState((draft) => {
                const source = draft.sourceLanguage;
                draft.sourceLanguage = draft.targetLanguage;
                draft.targetLanguage =
                    source === "Auto-detect" ? "English" : source;
            });
        },
        clear: () => {
            stopStream();
            lastRequest = null;
            setState((draft) => {
                draft.input = "";
                draft.displayText = "";
                draft.translationPreview = "";
                draft.status = "idle";
                draft.error = null;
                draft.mobilePane = "input";
            });
        },
        isRepeat: () =>
            Boolean(
                lastRequest &&
                state.input === lastRequest.input &&
                state.operation === lastRequest.operation &&
                state.sourceLanguage === lastRequest.inputLanguage &&
                state.targetLanguage === lastRequest.targetLanguage &&
                state.respellLanguage === lastRequest.respellLanguage &&
                (state.operation === "respell" &&
                    state.translateThenRespell) ===
                    lastRequest.translateThenRespell,
            ),
        sendMessage,
        stopStream,
    };
}
