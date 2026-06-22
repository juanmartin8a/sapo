import { fetch as expoFetch } from "expo/fetch";
import { Alert } from "react-native";
import { create } from "zustand";

import { getConvexAccessToken, getConvexAccessTokenWithUserId } from "@/clients/auth-client";
import {
    isLocalTranslationAbortError,
    stopActiveLocalTranslation,
    translateWithLocalModel,
} from "@/clients/local-translation";
import { languages, languagesPlusAutoDetect } from "@/constants/languages";
import useLanguageSelectorBottomSheetNotifier from "./languageSelectionNotifierStore";
import useLocalModelStore from "./localModelStore";
import usePagerPos from "./pagerPosStore";
import useTransformationOperationStore, {
    TransformationOperation,
} from "./transformationOperationStore";
import useTranslateButtonStateNotifier, { translateButtonState } from "./translateButtonStateNotifier";

const STREAM_END_MARKER = "<end:)>";
const STREAM_ERROR_MARKER = "<error:/>";
const STREAM_STOP_ENDPOINT_PATH = "/sapopinguino-stop";
const STOP_ABORT_GRACE_MS = 350;
const STOP_REQUEST_RETRY_MS = 75;
const STREAM_RESPONSE_TIMEOUT_MS = 15_000;
const STREAM_IDLE_TIMEOUT_MS = 20_000;
const STREAM_TOTAL_TIMEOUT_MS = 135_000;
const LOCAL_MODEL_SELECTION_ALERT_TITLE = "Select a local model";
const LOCAL_MODEL_SELECTION_ALERT_MESSAGE = "A local model must be selected before using offline translations.";

function wait(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

type ActiveStreamStopSnapshot = {
    abortController: AbortController | null;
    streamId: string | null;
    operation: TransformationOperation | null;
    convexToken: string | null;
    localStop: (() => Promise<void>) | null;
};

async function requestSapopinguinoStreamStop(snapshot: ActiveStreamStopSnapshot) {
    if (!snapshot.streamId || !snapshot.operation) {
        return;
    }

    const stopDeadline = Date.now() + STOP_ABORT_GRACE_MS;

    while (true) {
        const remainingStopWindowMs = stopDeadline - Date.now();
        if (remainingStopWindowMs <= 0) {
            return;
        }

        const stopRequestAbortController = new AbortController();
        const stopRequestTimeoutId = setTimeout(() => {
            stopRequestAbortController.abort();
        }, remainingStopWindowMs);

        try {
            const convexSiteUrl = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;
            if (!convexSiteUrl) {
                console.error("Missing EXPO_PUBLIC_CONVEX_SITE_URL for stop request");
                return;
            }

            const convexToken = snapshot.convexToken ?? (await getConvexAccessToken());

            if (!convexToken) {
                console.error("[sseStore] Failed to get Convex auth token for stop request");
                return;
            }

            const stopUrl = `${convexSiteUrl.replace(/\/$/, "")}${STREAM_STOP_ENDPOINT_PATH}`;
            const response = await expoFetch(stopUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${convexToken}`,
                },
                body: JSON.stringify({
                    streamId: snapshot.streamId,
                    operation: snapshot.operation,
                }),
                signal: stopRequestAbortController.signal,
            });

            if (response.ok) {
                return;
            }

            if (response.status !== 409 || Date.now() >= stopDeadline) {
                console.error(
                    `[sseStore] Stop request failed status=${response.status} streamId=${snapshot.streamId}`
                );
                return;
            }
        } catch (error) {
            if ((error as Error).name === "AbortError") {
                return;
            }

            console.error("[sseStore] Failed to request intentional stop:", error);
            return;
        } finally {
            clearTimeout(stopRequestTimeoutId);
        }

        if (Date.now() >= stopDeadline) {
            return;
        }

        await wait(STOP_REQUEST_RETRY_MS);
    }
}

interface Token {
    type: string;
    input?: string;
    transcription?: string;
    output?: string;
    value?: string;
}

interface SseState {
    tokens: Map<number, Token>;
    streamError: boolean;
    streamErrorMessage: string | null;
    abortController: AbortController | null;
    activeStreamId: string | null;
    activeStreamOperation: TransformationOperation | null;
    activeConvexToken: string | null;
    activeLocalStop: (() => Promise<void>) | null;
    isStreaming: boolean;
    lastTranslation: {
        inputLanguage: string;
        targetLanguage: string;
        input: string;
    } | null;

    disconnectStream: () => void;
    sendMessage: (input: string) => Promise<void>;
    repeatLastTranslation: () => void;
    stopStream: () => void;
    reset: () => void;
}

function splitSSEEventsFromChunkBuffer(chunkBuffer: string): { events: string[]; remainder: string } {
    const normalized = chunkBuffer.replace(/\r\n/g, "\n");
    const events: string[] = [];

    let cursor = 0;
    let boundary = normalized.indexOf("\n\n", cursor);

    while (boundary !== -1) {
        events.push(normalized.slice(cursor, boundary));
        cursor = boundary + 2;
        boundary = normalized.indexOf("\n\n", cursor);
    }

    return {
        events,
        remainder: normalized.slice(cursor),
    };
}

function splitLinesFromChunkBuffer(chunkBuffer: string): { lines: string[]; remainder: string } {
    const normalized = chunkBuffer.replace(/\r\n/g, "\n");
    const lines: string[] = [];

    let cursor = 0;
    let boundary = normalized.indexOf("\n", cursor);

    while (boundary !== -1) {
        lines.push(normalized.slice(cursor, boundary));
        cursor = boundary + 1;
        boundary = normalized.indexOf("\n", cursor);
    }

    return {
        lines,
        remainder: normalized.slice(cursor),
    };
}

function parseSSEEvent(rawEvent: string): { event: string | null; data: string | null } {
    const lines = rawEvent.split("\n");
    const dataLines: string[] = [];
    let event: string | null = null;

    for (const line of lines) {
        if (line.startsWith("event:")) {
            const eventValue = line.slice(6);
            event = (eventValue.startsWith(" ") ? eventValue.slice(1) : eventValue).trim();
            continue;
        }

        if (line.startsWith("data:")) {
            const dataValue = line.slice(5);
            dataLines.push(dataValue.startsWith(" ") ? dataValue.slice(1) : dataValue);
        }
    }

    if (dataLines.length === 0) {
        return { event, data: null };
    }

    return {
        event,
        data: dataLines.join("\n"),
    };
}

function getStreamErrorMessageFromCode(errorCode: string | null, status: number) {
    if (errorCode === "monthly_limit_exceeded" || status === 429) {
        return "Quota limit reached.";
    }

    if (errorCode === "input_limit_exceeded") {
        return "Input limit reached.";
    }

    if (errorCode === "user_deletion_in_progress") {
        return "Account deletion is in progress.";
    }

    return "An error occurred";
}

function resolveStreamErrorMessage(responseText: string, status: number) {
    if (responseText.trim().length === 0) {
        return getStreamErrorMessageFromCode(null, status);
    }

    try {
        const parsedResponse = JSON.parse(responseText) as unknown;

        if (typeof parsedResponse === "object" && parsedResponse !== null) {
            const typedResponse = parsedResponse as { error?: unknown; message?: unknown };

            if (typeof typedResponse.error === "string") {
                return getStreamErrorMessageFromCode(typedResponse.error, status);
            }
        }
    } catch {
        return getStreamErrorMessageFromCode(null, status);
    }

    return getStreamErrorMessageFromCode(null, status);
}

async function readStreamErrorMessage(response: Response) {
    try {
        return resolveStreamErrorMessage(await response.text(), response.status);
    } catch {
        return getStreamErrorMessageFromCode(null, response.status);
    }
}

const useSseStore = create<SseState>((set, get) => {
    let activeSendMessageId: string | null = null;

    const clearActiveSendMessage = () => {
        activeSendMessageId = null;
    };

    const setTranslateButtonState = (nextState: translateButtonState) => {
        const { state, switchState } = useTranslateButtonStateNotifier.getState();
        if (state !== nextState) {
            switchState(nextState);
        }
    };

    const setIdleTranslateButtonState = () => {
        const pagerPos = usePagerPos.getState().pos;
        setTranslateButtonState(pagerPos === 1 ? "repeat" : "next");
    };

    const getActiveStreamStopSnapshot = (): ActiveStreamStopSnapshot => {
        const {
            abortController,
            activeStreamId,
            activeStreamOperation,
            activeConvexToken,
            activeLocalStop,
        } = get();

        return {
            abortController,
            streamId: activeStreamId,
            operation: activeStreamOperation,
            convexToken: activeConvexToken,
            localStop: activeLocalStop,
        };
    };

    const requestStopThenAbortStream = (snapshot: ActiveStreamStopSnapshot) => {
        void (async () => {
            try {
                if (snapshot.localStop) {
                    await snapshot.localStop();
                    return;
                }

                await requestSapopinguinoStreamStop(snapshot);
            } finally {
                if (snapshot.abortController) {
                    snapshot.abortController.abort();
                }

                if (get().abortController === snapshot.abortController) {
                    set({
                        abortController: null,
                        activeConvexToken: null,
                        activeLocalStop: null,
                    });
                }
            }
        })();
    };

    const appendToken = (token: Token) => {
        set((state) => {
            const nextTokens = new Map(state.tokens);
            nextTokens.set(nextTokens.size, token);
            return { tokens: nextTokens };
        });
    };

    const setTranslationToken = (value: string) => {
        set({ tokens: new Map([[0, { type: "translate", value }]]) });
    };

    const parseToken = (payload: string, operation: TransformationOperation): Token => {
        if (operation === "translate") {
            return {
                type: "translate",
                value: payload,
            };
        }

        const parsed = JSON.parse(payload) as Token;
        if (typeof parsed !== "object" || parsed === null || typeof parsed.type !== "string") {
            throw new Error("Invalid transliteration token payload");
        }

        return parsed;
    };

    return {
        tokens: new Map<number, Token>(),
        streamError: false,
        streamErrorMessage: null,
        abortController: null,
        activeStreamId: null,
        activeStreamOperation: null,
        activeConvexToken: null,
        activeLocalStop: null,
        isStreaming: false,
        lastTranslation: null,

        disconnectStream: () => {
            const streamSnapshot = getActiveStreamStopSnapshot();

            clearActiveSendMessage();
            setIdleTranslateButtonState();
            set({
                abortController: null,
                activeStreamId: null,
                activeStreamOperation: null,
                activeConvexToken: null,
                activeLocalStop: null,
                isStreaming: false,
            });

            requestStopThenAbortStream(streamSnapshot);
        },

        sendMessage: async (input: string) => {
            if (activeSendMessageId !== null || get().isStreaming || get().abortController !== null) {
                return;
            }

            const selectedInputIndex = useLanguageSelectorBottomSheetNotifier.getState().selectedIndex0;
            const selectedTargetIndex = useLanguageSelectorBottomSheetNotifier.getState().selectedIndex1;

            const inputLanguage =
                languagesPlusAutoDetect[selectedInputIndex as keyof typeof languagesPlusAutoDetect] ??
                languagesPlusAutoDetect[0];
            const targetLanguage =
                languages[selectedTargetIndex as keyof typeof languages] ??
                languages[1 as keyof typeof languages];

            const operation = useTransformationOperationStore.getState().operation;
            const endpointPath = operation === "translate"
                ? "/sapopinguino-translate"
                : "/sapopinguino";
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
                        try {
                            await useLocalModelStore.getState().loadModel();

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
                                console.warn("Unable to load local model", error);
                            }

                            Alert.alert(
                                "Unable to load local model",
                                "Unable to load the local model. Please try again."
                            );
                            return;
                        }
                    }

                    const abortController = new AbortController();
                    const stopLocalTranslation = async () => {
                        abortController.abort();
                        await stopActiveLocalTranslation();
                    };

                    set({
                        lastTranslation: { inputLanguage, targetLanguage, input },
                        tokens: new Map<number, Token>(),
                        streamError: false,
                        streamErrorMessage: null,
                        abortController,
                        activeStreamId: streamId,
                        activeStreamOperation: operation,
                        activeConvexToken: null,
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
                    let localModelWasReady = readyLocalModelState.isLoaded;

                    try {
                        if (!localModelWasReady) {
                            useLocalModelStore.getState().setLoading(true);
                        }

                        setTranslateButtonState("stop");

                        const translatedText = await translateWithLocalModel(
                            { inputLanguage, targetLanguage, input },
                            {
                                signal: abortController.signal,
                                onReady: () => {
                                    localModelWasReady = true;
                                    useLocalModelStore.getState().setLoaded(true);
                                    useLocalModelStore.getState().setLoading(false);
                                },
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

                        setTranslationToken(translatedText);
                        setIdleTranslateButtonState();
                    } catch (error) {
                        acceptLocalTokens = false;
                        useLocalModelStore.getState().setLoading(false);

                        if (isLocalTranslationAbortError(error) || !localModelWasReady) {
                            useLocalModelStore.getState().setLoaded(false);
                        }

                        if (!isLocalTranslationAbortError(error) && isActiveLocalRequest()) {
                            console.error("Local translation failed:", error);
                            markLocalTranslationError("Local translation failed. Please try again.");
                        }
                    } finally {
                        acceptLocalTokens = false;
                        useLocalModelStore.getState().setLoading(false);

                        if (isActiveLocalRequest()) {
                            set({
                                abortController: null,
                                activeStreamId: null,
                                activeStreamOperation: null,
                                activeConvexToken: null,
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
                    activeStreamOperation: null,
                    activeConvexToken: null,
                    activeLocalStop: null,
                    isStreaming: false,
                });
                setIdleTranslateButtonState();
                return;
            }

            const abortController = new AbortController();
            const streamUrl = `${convexSiteUrl.replace(/\/$/, "")}${endpointPath}`;
            const requestInput = JSON.stringify({
                input_language: inputLanguage,
                target_language: targetLanguage,
                input,
            });

            if (__DEV__) {
                console.log(
                    `[sseStore] Starting stream request operation=${operation} endpoint=${endpointPath}`
                );
            }

            set({
                lastTranslation: { inputLanguage, targetLanguage, input },
                tokens: new Map<number, Token>(),
                streamError: false,
                streamErrorMessage: null,
                abortController,
                activeStreamId: streamId,
                activeStreamOperation: operation,
                activeConvexToken: null,
                activeLocalStop: null,
                isStreaming: true,
            });

            const isActiveRequest = () =>
                get().abortController === abortController && get().activeStreamId === streamId;

            const markStreamError = (message = "An error occurred") => {
                set({ streamError: true, streamErrorMessage: message });
                setIdleTranslateButtonState();
            };

            const markStreamEventError = (payload: string | null) => {
                if (!payload || payload === STREAM_ERROR_MARKER) {
                    markStreamError();
                    return;
                }

                markStreamError(resolveStreamErrorMessage(payload, 500));
            };

            const processTokenPayload = (payload: string): "continue" | "stop" => {
                if (!isActiveRequest()) {
                    return "stop";
                }

                if (payload === STREAM_END_MARKER) {
                    setIdleTranslateButtonState();
                    return "stop";
                }

                if (payload === STREAM_ERROR_MARKER) {
                    console.error(
                        `[sseStore] Stream returned error marker endpoint=${endpointPath}`
                    );
                    markStreamError();
                    return "stop";
                }

                try {
                    const token = parseToken(payload, operation);
                    setTranslateButtonState("stop");
                    appendToken(token);
                } catch (error) {
                    console.error("Failed to parse streamed token:", error);
                    markStreamError();
                    return "stop";
                }

                return "continue";
            };

            type StreamTimeoutReason = "response" | "idle" | "total";
            let streamTimeoutReason: StreamTimeoutReason | null = null;
            let responseTimeoutId: ReturnType<typeof setTimeout> | null = null;
            let idleTimeoutId: ReturnType<typeof setTimeout> | null = null;
            let totalTimeoutId: ReturnType<typeof setTimeout> | null = null;

            const clearResponseTimeout = () => {
                if (responseTimeoutId !== null) {
                    clearTimeout(responseTimeoutId);
                    responseTimeoutId = null;
                }
            };

            const clearIdleTimeout = () => {
                if (idleTimeoutId !== null) {
                    clearTimeout(idleTimeoutId);
                    idleTimeoutId = null;
                }
            };

            const clearTotalTimeout = () => {
                if (totalTimeoutId !== null) {
                    clearTimeout(totalTimeoutId);
                    totalTimeoutId = null;
                }
            };

            const abortStreamForTimeout = (reason: StreamTimeoutReason) => {
                if (abortController.signal.aborted) {
                    return;
                }

                streamTimeoutReason = reason;
                abortController.abort();
            };

            const refreshIdleTimeout = () => {
                clearIdleTimeout();
                idleTimeoutId = setTimeout(
                    () => abortStreamForTimeout("idle"),
                    STREAM_IDLE_TIMEOUT_MS
                );
            };

            try {
                totalTimeoutId = setTimeout(
                    () => abortStreamForTimeout("total"),
                    STREAM_TOTAL_TIMEOUT_MS
                );

                const authContext = await getConvexAccessTokenWithUserId();
                const convexToken = authContext?.token ?? null;

                if (!convexToken || !authContext?.userId || !isActiveRequest()) {
                    if (isActiveRequest()) {
                        console.error("[sseStore] Failed to get Convex auth token for stream request");
                        markStreamError();
                    }

                    return;
                }

                set({ activeConvexToken: convexToken });

                responseTimeoutId = setTimeout(
                    () => abortStreamForTimeout("response"),
                    STREAM_RESPONSE_TIMEOUT_MS
                );

                let response: Response;

                try {
                    response = await expoFetch(streamUrl, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Accept: "text/event-stream",
                            Authorization: `Bearer ${convexToken}`,
                        },
                        body: JSON.stringify({ input: requestInput, streamId }),
                        signal: abortController.signal,
                    });
                } finally {
                    clearResponseTimeout();
                }

                if (!response.ok) {
                    if (isActiveRequest()) {
                        const errorMessage = await readStreamErrorMessage(response);

                        console.error(
                            `[sseStore] Stream request failed status=${response.status} endpoint=${endpointPath}`
                        );
                        markStreamError(errorMessage);
                    }
                    return;
                }

                const contentType = response.headers.get("content-type") ?? "";
                const responseBody = response.body;

                if (!responseBody || typeof responseBody.getReader !== "function") {
                    const fullText = await response.text();

                    if (!isActiveRequest()) {
                        return;
                    }

                    if (contentType.includes("text/event-stream")) {
                        const { events, remainder } = splitSSEEventsFromChunkBuffer(fullText);

                        for (const rawEvent of events) {
                            const { event, data } = parseSSEEvent(rawEvent);
                            if (data === null) {
                                continue;
                            }

                            if (event === "error") {
                                markStreamEventError(data);
                                return;
                            }

                            if (event === "done") {
                                setIdleTranslateButtonState();
                                return;
                            }

                            const nextStep = processTokenPayload(data);
                            if (nextStep === "stop") {
                                return;
                            }
                        }

                        if (remainder.trim().length > 0) {
                            const { event, data } = parseSSEEvent(remainder);
                            if (data !== null) {
                                if (event === "error") {
                                    markStreamEventError(data);
                                    return;
                                }

                                if (event === "done") {
                                    setIdleTranslateButtonState();
                                    return;
                                }

                                const nextStep = processTokenPayload(data);
                                if (nextStep === "stop") {
                                    return;
                                }
                            }
                        }
                    } else {
                        const normalized = fullText.replace(/\r\n/g, "\n");
                        const lines = normalized.split("\n");

                        for (const line of lines) {
                            if (line.length === 0) {
                                continue;
                            }

                            const nextStep = processTokenPayload(line);
                            if (nextStep === "stop") {
                                return;
                            }
                        }
                    }

                    if (isActiveRequest()) {
                        setIdleTranslateButtonState();
                    }
                    return;
                }

                const reader = responseBody.getReader();
                const decoder = new TextDecoder();

                if (contentType.includes("text/event-stream")) {
                    let eventBuffer = "";
                    refreshIdleTimeout();

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) {
                            break;
                        }

                        refreshIdleTimeout();

                        if (!isActiveRequest()) {
                            return;
                        }

                        eventBuffer += decoder.decode(value, { stream: true });
                        const { events, remainder } = splitSSEEventsFromChunkBuffer(eventBuffer);
                        eventBuffer = remainder;

                        for (const rawEvent of events) {
                            const { event, data } = parseSSEEvent(rawEvent);
                            if (data === null) {
                                continue;
                            }

                            if (event === "error") {
                                markStreamEventError(data);
                                return;
                            }

                            if (event === "done") {
                                setIdleTranslateButtonState();
                                return;
                            }

                            const nextStep = processTokenPayload(data);
                            if (nextStep === "stop") {
                                return;
                            }
                        }
                    }

                    if (eventBuffer.trim().length > 0) {
                        const { event, data } = parseSSEEvent(eventBuffer);
                        if (data !== null) {
                            if (event === "error") {
                                markStreamEventError(data);
                                return;
                            }

                            if (event === "done") {
                                setIdleTranslateButtonState();
                                return;
                            }

                            const nextStep = processTokenPayload(data);
                            if (nextStep === "stop") {
                                return;
                            }
                        }
                    }
                } else {
                    let lineBuffer = "";
                    refreshIdleTimeout();

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) {
                            break;
                        }

                        refreshIdleTimeout();

                        if (!isActiveRequest()) {
                            return;
                        }

                        lineBuffer += decoder.decode(value, { stream: true });
                        const { lines, remainder } = splitLinesFromChunkBuffer(lineBuffer);
                        lineBuffer = remainder;

                        for (const line of lines) {
                            if (line.length === 0) {
                                continue;
                            }

                            const nextStep = processTokenPayload(line);
                            if (nextStep === "stop") {
                                return;
                            }
                        }
                    }

                    if (lineBuffer.length > 0) {
                        const nextStep = processTokenPayload(lineBuffer);
                        if (nextStep === "stop") {
                            return;
                        }
                    }
                }

                if (isActiveRequest()) {
                    setIdleTranslateButtonState();
                }
            } catch (error) {
                if ((error as Error).name === "AbortError") {
                    if (streamTimeoutReason !== null && isActiveRequest()) {
                        console.error(
                            `[sseStore] Stream request timed out reason=${streamTimeoutReason} endpoint=${endpointPath}`
                        );
                        markStreamError("The request timed out. Please try again.");
                    }

                    return;
                }

                if (isActiveRequest()) {
                    console.error("SSE stream request failed:", error);
                    markStreamError();
                }
            } finally {
                clearResponseTimeout();
                clearIdleTimeout();
                clearTotalTimeout();

                if (isActiveRequest()) {
                    set({
                        abortController: null,
                        activeStreamId: null,
                        activeStreamOperation: null,
                        activeConvexToken: null,
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
            const { lastTranslation } = get();
            if (lastTranslation) {
                get().sendMessage(lastTranslation.input);
            }
        },

        stopStream: () => {
            const streamSnapshot = getActiveStreamStopSnapshot();

            clearActiveSendMessage();
            setIdleTranslateButtonState();
            set({
                streamError: false,
                streamErrorMessage: null,
                activeStreamId: null,
                activeStreamOperation: null,
                activeLocalStop: null,
                isStreaming: false,
            });

            requestStopThenAbortStream(streamSnapshot);
        },

        reset: () => {
            const streamSnapshot = getActiveStreamStopSnapshot();

            clearActiveSendMessage();
            setIdleTranslateButtonState();
            set({
                tokens: new Map<number, Token>(),
                streamError: false,
                streamErrorMessage: null,
                abortController: null,
                activeStreamId: null,
                activeStreamOperation: null,
                activeConvexToken: null,
                activeLocalStop: null,
                isStreaming: false,
                lastTranslation: null,
            });

            requestStopThenAbortStream(streamSnapshot);
        },
    };
});

export default useSseStore;
