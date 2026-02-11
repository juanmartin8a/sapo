import { fetch as expoFetch } from "expo/fetch";
import { create } from "zustand";
import { languages, languagesPlusAutoDetect } from "@/constants/languages";
import useLanguageSelectorBottomSheetNotifier from "./languageSelectionNotifierStore";
import usePagerPos from "./pagerPosStore";
import useTranslModeStore, { TransformationMode } from "./translModeStore";
import useTranslateButtonStateNotifier, { translateButtonState } from "./translateButtonStateNotifier";

const STREAM_END_MARKER = "<end:)>";
const STREAM_ERROR_MARKER = "<error:/>";

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
    abortController: AbortController | null;
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

const useSseStore = create<SseState>((set, get) => {
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

    const appendToken = (token: Token) => {
        set((state) => {
            const nextTokens = new Map(state.tokens);
            nextTokens.set(nextTokens.size, token);
            return { tokens: nextTokens };
        });
    };

    const parseToken = (payload: string, mode: TransformationMode): Token => {
        if (mode === "translate") {
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
        abortController: null,
        isStreaming: false,
        lastTranslation: null,

        disconnectStream: () => {
            const { abortController } = get();
            if (abortController) {
                abortController.abort();
            }

            set({
                abortController: null,
                isStreaming: false,
            });
        },

        sendMessage: async (input: string) => {
            const selectedInputIndex = useLanguageSelectorBottomSheetNotifier.getState().selectedIndex0;
            const selectedTargetIndex = useLanguageSelectorBottomSheetNotifier.getState().selectedIndex1;

            const inputLanguage =
                languagesPlusAutoDetect[selectedInputIndex as keyof typeof languagesPlusAutoDetect] ??
                languagesPlusAutoDetect[0];
            const targetLanguage =
                languages[selectedTargetIndex as keyof typeof languages] ??
                languages[1 as keyof typeof languages];

            const mode = useTranslModeStore.getState().mode;
            const endpointPath = mode === "translate" ? "/sapopinguino-translate" : "/sapopinguino";
            const convexSiteUrl = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;

            setTranslateButtonState("loading");

            const previousController = get().abortController;
            if (previousController) {
                previousController.abort();
            }

            if (!convexSiteUrl) {
                console.error("Missing EXPO_PUBLIC_CONVEX_SITE_URL for SSE request");
                set({
                    streamError: true,
                    abortController: null,
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

            set({
                lastTranslation: { inputLanguage, targetLanguage, input },
                tokens: new Map<number, Token>(),
                streamError: false,
                abortController,
                isStreaming: true,
            });

            const isActiveRequest = () => get().abortController === abortController;

            const markStreamError = () => {
                set({ streamError: true });
                setIdleTranslateButtonState();
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
                    markStreamError();
                    return "stop";
                }

                try {
                    const token = parseToken(payload, mode);
                    setTranslateButtonState("stop");
                    appendToken(token);
                } catch (error) {
                    console.error("Failed to parse streamed token:", error);
                    markStreamError();
                    return "stop";
                }

                return "continue";
            };

            try {
                const response = await expoFetch(streamUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "text/event-stream",
                    },
                    body: JSON.stringify({ input: requestInput }),
                    signal: abortController.signal,
                });

                if (!response.ok) {
                    if (isActiveRequest()) {
                        markStreamError();
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
                                markStreamError();
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
                                    markStreamError();
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

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) {
                            break;
                        }

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
                                markStreamError();
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
                                markStreamError();
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

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) {
                            break;
                        }

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
                if ((error as Error).name !== "AbortError" && isActiveRequest()) {
                    console.error("SSE stream request failed:", error);
                    markStreamError();
                }
            } finally {
                if (isActiveRequest()) {
                    set({
                        abortController: null,
                        isStreaming: false,
                    });
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
            const { abortController } = get();
            if (abortController) {
                abortController.abort();
            }

            setIdleTranslateButtonState();
            set({
                streamError: false,
                abortController: null,
                isStreaming: false,
            });
        },

        reset: () => {
            const { abortController } = get();
            if (abortController) {
                abortController.abort();
            }

            set({
                tokens: new Map<number, Token>(),
                streamError: false,
                abortController: null,
                isStreaming: false,
                lastTranslation: null,
            });
        },
    };
});

export default useSseStore;
