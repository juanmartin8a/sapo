import { Alert } from "react-native";
import { create } from "zustand";

import {
    isLocalTranslationAbortError,
    stopActiveLocalTranslation,
    translateWithLocalModel,
} from "@/lib/local-translation";
import {
    getTranslationStreamEndpointPath,
    runTranslationStream,
    type TranslationStreamToken,
} from "@/lib/translation-stream";
import {
    DEFAULT_SOURCE_LANGUAGE_ID,
    DEFAULT_TARGET_LANGUAGE_ID,
    languages,
    languagesPlusAutoDetect,
} from "@/constants/languages";
import useLanguageSelectionStore from "./languageSelectionStore";
import useLocalModelStore from "./localModelStore";
import usePagerStore from "./pagerStore";
import useTransformationOperationStore from "./transformationOperationStore";
import useTranslateButtonStore, { type TranslateButtonState } from "./translateButtonStore";

const LOCAL_MODEL_SELECTION_ALERT_TITLE = "Select a local model";
const LOCAL_MODEL_SELECTION_ALERT_MESSAGE = "A local model must be selected before using offline translations.";

type ActiveStreamSnapshot = {
    abortController: AbortController | null;
    localStop: (() => Promise<void>) | null;
};

interface TranslationStoreState {
    displayText: string;
    mouthTriggerVersion: number;
    streamError: boolean;
    streamErrorMessage: string | null;
    abortController: AbortController | null;
    activeStreamId: string | null;
    activeLocalStop: (() => Promise<void>) | null;
    isStreaming: boolean;
    lastInput: string | null;

    disconnectStream: () => void;
    sendMessage: (input: string) => Promise<void>;
    repeatLastTranslation: () => void;
    stopStream: () => void;
}

const useTranslationStore = create<TranslationStoreState>((set, get) => {
    let activeSendMessageId: string | null = null;

    const clearActiveSendMessage = () => {
        activeSendMessageId = null;
    };

    const setTranslateButtonState = (nextState: TranslateButtonState) => {
        const { state, switchState } = useTranslateButtonStore.getState();
        if (state !== nextState) {
            switchState(nextState);
        }
    };

    const setIdleTranslateButtonState = () => {
        const pagerPos = usePagerStore.getState().pos;
        setTranslateButtonState(pagerPos === 1 ? "repeat" : "next");
    };

    const getActiveStreamSnapshot = (): ActiveStreamSnapshot => {
        const { abortController, activeLocalStop } = get();

        return {
            abortController,
            localStop: activeLocalStop,
        };
    };

    const abortActiveStream = (snapshot: ActiveStreamSnapshot) => {
        void (async () => {
            try {
                if (snapshot.localStop) {
                    await snapshot.localStop();
                }
            } finally {
                snapshot.abortController?.abort();

                if (get().abortController === snapshot.abortController) {
                    set({
                        abortController: null,
                        activeLocalStop: null,
                    });
                }
            }
        })();
    };

    const appendToken = (token: TranslationStreamToken) => {
        const text = token.type === "word" ? token.output ?? "" : token.value ?? "";

        set((state) => ({
            displayText: state.displayText + text,
            mouthTriggerVersion: token.type === "word" || token.type === "translate"
                ? state.mouthTriggerVersion + 1
                : state.mouthTriggerVersion,
        }));
    };

    const setTranslationText = (value: string) => {
        set((state) => ({
            displayText: value,
            mouthTriggerVersion: state.mouthTriggerVersion + 1,
        }));
    };

    return {
        displayText: "",
        mouthTriggerVersion: 0,
        streamError: false,
        streamErrorMessage: null,
        abortController: null,
        activeStreamId: null,
        activeLocalStop: null,
        isStreaming: false,
        lastInput: null,

        disconnectStream: () => {
            const streamSnapshot = getActiveStreamSnapshot();

            clearActiveSendMessage();
            setIdleTranslateButtonState();
            set({
                abortController: null,
                activeStreamId: null,
                activeLocalStop: null,
                isStreaming: false,
            });

            abortActiveStream(streamSnapshot);
        },

        sendMessage: async (input: string) => {
            if (activeSendMessageId !== null || get().isStreaming || get().abortController !== null) {
                return;
            }

            const selectedInputIndex = useLanguageSelectionStore.getState().selectedIndex0;
            const selectedTargetIndex = useLanguageSelectionStore.getState().selectedIndex1;

            const inputLanguage =
                languagesPlusAutoDetect[selectedInputIndex as keyof typeof languagesPlusAutoDetect] ??
                languagesPlusAutoDetect[DEFAULT_SOURCE_LANGUAGE_ID];
            const targetLanguage =
                languages[selectedTargetIndex as keyof typeof languages] ??
                languages[DEFAULT_TARGET_LANGUAGE_ID];

            const operation = useTransformationOperationStore.getState().operation;
            const endpointPath = getTranslationStreamEndpointPath(operation);
            const convexSiteUrl = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;
            const streamId = globalThis.crypto?.randomUUID?.()
                ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            const isLatestSendMessage = () => activeSendMessageId === streamId;

            activeSendMessageId = streamId;
            setTranslateButtonState("loading");

            if (operation === "translate") {
                const localModelState = useLocalModelStore.getState();
                const shouldUseLocalModel = localModelState.isEnabled;

                if (shouldUseLocalModel) {
                    let readyLocalModelState = localModelState;

                    if (!readyLocalModelState.selectedModelId || !readyLocalModelState.isDownloaded) {
                        try {
                            await useLocalModelStore.getState().refreshDownloadedStatus();

                            if (!isLatestSendMessage()) {
                                return;
                            }

                            readyLocalModelState = useLocalModelStore.getState();
                        } catch (error) {
                            if (!isLatestSendMessage()) {
                                return;
                            }

                            clearActiveSendMessage();
                            setIdleTranslateButtonState();
                            set({ streamError: false, streamErrorMessage: null });

                            if (__DEV__) {
                                console.warn("Unable to refresh local model status", error);
                            }

                            Alert.alert(
                                "Unable to check local model",
                                "Unable to check the local model status. Please try again."
                            );
                            return;
                        }
                    }

                    if (!readyLocalModelState.selectedModelId || !readyLocalModelState.isDownloaded) {
                        clearActiveSendMessage();
                        setIdleTranslateButtonState();
                        set({ streamError: false, streamErrorMessage: null });
                        Alert.alert(LOCAL_MODEL_SELECTION_ALERT_TITLE, LOCAL_MODEL_SELECTION_ALERT_MESSAGE);
                        return;
                    }

                    if (
                        !readyLocalModelState.isLoaded ||
                        readyLocalModelState.loadedModelId !== readyLocalModelState.selectedModelId
                    ) {
                        clearActiveSendMessage();
                        setIdleTranslateButtonState();
                        set({ streamError: false, streamErrorMessage: null });
                        Alert.alert(
                            "Load local model",
                            "Press Load model in the sidebar before starting a local translation."
                        );
                        return;
                    }

                    const abortController = new AbortController();
                    const stopLocalTranslation = async () => {
                        abortController.abort();
                        await stopActiveLocalTranslation();
                    };

                    set({
                        lastInput: input,
                        displayText: "",
                        streamError: false,
                        streamErrorMessage: null,
                        abortController,
                        activeStreamId: streamId,
                        activeLocalStop: stopLocalTranslation,
                        isStreaming: true,
                    });

                    const isActiveLocalRequest = () =>
                        get().abortController === abortController && get().activeStreamId === streamId;

                    const markLocalTranslationError = (message = "Local translation failed.") => {
                        set({ streamError: true, streamErrorMessage: message });
                        setIdleTranslateButtonState();
                    };
                    let acceptLocalTokens = true;

                    try {
                        setTranslateButtonState("stop");

                        const translatedText = await translateWithLocalModel(
                            { inputLanguage, targetLanguage, input },
                            {
                                signal: abortController.signal,
                                onToken: (token) => {
                                    if (!acceptLocalTokens || !isActiveLocalRequest()) {
                                        return;
                                    }

                                    setTranslateButtonState("stop");
                                    appendToken({ type: "translate", value: token });
                                },
                            }
                        );

                        if (!isActiveLocalRequest()) {
                            return;
                        }

                        acceptLocalTokens = false;

                        if (translatedText.trim().length === 0) {
                            markLocalTranslationError("Local model returned an empty translation.");
                            return;
                        }

                        setTranslationText(translatedText);
                        setIdleTranslateButtonState();
                    } catch (error) {
                        acceptLocalTokens = false;

                        if (isLocalTranslationAbortError(error)) {
                            useLocalModelStore.getState().setLoaded(false);
                        }

                        if (!isLocalTranslationAbortError(error) && isActiveLocalRequest()) {
                            console.error("Local translation failed:", error);
                            markLocalTranslationError("Local translation failed. Please try again.");
                        }
                    } finally {
                        acceptLocalTokens = false;

                        if (isActiveLocalRequest()) {
                            set({
                                abortController: null,
                                activeStreamId: null,
                                activeLocalStop: null,
                                isStreaming: false,
                            });
                        }

                        if (activeSendMessageId === streamId) {
                            clearActiveSendMessage();
                        }
                    }

                    return;
                }
            }

            if (!convexSiteUrl) {
                console.error("Missing EXPO_PUBLIC_CONVEX_SITE_URL for SSE request");
                clearActiveSendMessage();
                set({
                    streamError: true,
                    streamErrorMessage: "An error occurred",
                    abortController: null,
                    activeStreamId: null,
                    activeLocalStop: null,
                    isStreaming: false,
                });
                setIdleTranslateButtonState();
                return;
            }

            const abortController = new AbortController();

            if (__DEV__) {
                console.log(
                    `[translationStore] Starting stream request operation=${operation} endpoint=${endpointPath}`
                );
            }

            set({
                lastInput: input,
                displayText: "",
                streamError: false,
                streamErrorMessage: null,
                abortController,
                activeStreamId: streamId,
                activeLocalStop: null,
                isStreaming: true,
            });

            const isActiveRequest = () =>
                get().abortController === abortController && get().activeStreamId === streamId;

            const markStreamError = (message = "An error occurred") => {
                set({ streamError: true, streamErrorMessage: message });
                setIdleTranslateButtonState();
            };

            try {
                const result = await runTranslationStream(
                    {
                        operation,
                        convexSiteUrl,
                        inputLanguage,
                        targetLanguage,
                        input,
                        streamId,
                        abortController,
                    },
                    {
                        isActive: isActiveRequest,
                        onToken: (token) => {
                            if (!isActiveRequest()) {
                                return "stop";
                            }

                            setTranslateButtonState("stop");
                            appendToken(token);
                            return "continue";
                        },
                        onDone: setIdleTranslateButtonState,
                        onStreamError: (message, source) => {
                            if (source === "marker") {
                                console.error(
                                    `[translationStore] Stream returned error marker endpoint=${endpointPath}`
                                );
                            }

                            markStreamError(message);
                        },
                    }
                );

                if (result.type === "auth-error") {
                    if (isActiveRequest()) {
                        console.error("[translationStore] Failed to get Convex auth token for stream request");
                        markStreamError();
                    }
                    return;
                }

                if (result.type === "http-error") {
                    if (isActiveRequest()) {
                        console.error(
                            `[translationStore] Stream request failed status=${result.status} endpoint=${endpointPath}`
                        );
                        markStreamError(result.message);
                    }
                    return;
                }

                if (result.type === "protocol-error") {
                    if (isActiveRequest()) {
                        console.error("Failed to parse streamed token:", result.error);
                        markStreamError();
                    }
                    return;
                }

                if (result.type === "timeout") {
                    if (isActiveRequest()) {
                        console.error(
                            `[translationStore] Stream request timed out reason=${result.reason} endpoint=${endpointPath}`
                        );
                        markStreamError("The request timed out. Please try again.");
                    }
                    return;
                }

                if (result.type === "transport-error") {
                    if (isActiveRequest()) {
                        console.error("SSE stream request failed:", result.error);
                        markStreamError();
                    }
                    return;
                }

                if (result.type === "completed" && isActiveRequest()) {
                    setIdleTranslateButtonState();
                }
            } finally {
                if (isActiveRequest()) {
                    set({
                        abortController: null,
                        activeStreamId: null,
                        activeLocalStop: null,
                        isStreaming: false,
                    });
                }

                if (activeSendMessageId === streamId) {
                    clearActiveSendMessage();
                }
            }
        },

        repeatLastTranslation: () => {
            const { lastInput } = get();
            if (lastInput) {
                get().sendMessage(lastInput);
            }
        },

        stopStream: () => {
            const streamSnapshot = getActiveStreamSnapshot();

            clearActiveSendMessage();
            setIdleTranslateButtonState();
            set({
                streamError: false,
                streamErrorMessage: null,
                activeStreamId: null,
                activeLocalStop: null,
                isStreaming: false,
            });

            abortActiveStream(streamSnapshot);
        },

    };
});

export default useTranslationStore;
