import { create } from 'zustand';
import useTranslateButtonStateNotifier from './translateButtonStateNotifier';
import usePagerPos from './pagerPosStore';
import { languages, languagesPlusAutoDetect } from '@/constants/languages';
import useLanguageSelectorBottomSheetNotifier from './languageSelectorBottomSheetNotifierStore';
import useTranslModeStore from './translModeStore';

interface Token {
    type: string;
    input?: string;
    transcription?: string;
    output?: string;
    value?: string;
}

interface WebSocketState {
    tokens: Map<number, Token>;
    wsError: boolean;
    socket: WebSocket | null;
    isConnected: boolean;
    lastTranslation: {
        inputLanguage: string;
        targetLanguage: string;
        input: string;
    } | null;

    connectWebSocket: () => Promise<void>;
    disconnectWebSocket: () => void;
    sendMessage: (input: string) => Promise<void>;
    repeatLastTranslation: () => void;
    stopStream: () => void;
    reset: () => void;
}

const useWebSocketStore = create<WebSocketState>((set, get) => ({
    tokens: new Map<number, Token>(),
    wsError: false,
    socket: null,
    isConnected: false,
    lastTranslation: null,

    connectWebSocket: () => {
        return new Promise<void>((resolve, reject) => {
            const switchTranslateButtonState = useTranslateButtonStateNotifier.getState().switchState
            const translModeState = useTranslModeStore.getState().mode

            if (get().socket !== null) {
                get().socket!.close();
            }

            const socket = new WebSocket('wss://gy2rem2fsd.execute-api.us-east-2.amazonaws.com/prod/');

            socket.onopen = () => {
                console.log('WebSocket connection established');
                set({ socket, isConnected: true });
                resolve();
            };

            socket.onmessage = (event) => {
                console.log('Message received:', event.data);

                if (event.data.includes('<end:)>')) {
                    const translateButtonState = useTranslateButtonStateNotifier.getState().state

                    const pagerPos = usePagerPos.getState().pos // put this block in a function
                    if (pagerPos === 1) {
                        if (translateButtonState !== "repeat") {
                            switchTranslateButtonState("repeat");
                        }
                    } else {
                        if (translateButtonState !== "next") {
                            switchTranslateButtonState("next");
                        }
                    }

                    socket.close();
                    set({ isConnected: false });
                } else if (event.data.includes('<error:/>')) {
                    const translateButtonState = useTranslateButtonStateNotifier.getState().state
                    const pagerPos = usePagerPos.getState().pos
                    if (pagerPos === 1) {
                        if (translateButtonState !== "repeat") {
                            switchTranslateButtonState("repeat");
                        }
                    } else {
                        if (translateButtonState !== "next") {
                            switchTranslateButtonState("next");
                        }
                    }
                    set({ wsError: true, isConnected: false });
                    socket.close();
                } else {
                    try {
                        const translateButtonState = useTranslateButtonStateNotifier.getState().state
                        if (translateButtonState !== "stop") {
                            switchTranslateButtonState("stop");
                        }

                        let token: Token

                        if (translModeState === 'translate') {
                            token = {
                                type: 'translate',
                                value: event.data
                            }
                        } else {
                            token = JSON.parse(event.data);
                        }

                        set((state) => {
                            const newTokens = new Map(state.tokens);
                            newTokens.set(
                                state.tokens.size === 0 ? 0 : Math.max(...Array.from(state.tokens.keys())) + 1,
                                token
                            );
                            return { tokens: newTokens };
                        });

                    } catch (error) {
                        const translateButtonState = useTranslateButtonStateNotifier.getState().state
                        const pagerPos = usePagerPos.getState().pos
                        if (pagerPos === 1) {
                            if (translateButtonState !== "repeat") {
                                switchTranslateButtonState("repeat");
                            }
                        } else {
                            if (translateButtonState !== "next") {
                                switchTranslateButtonState("next");
                            }
                        }
                        set({ wsError: true, isConnected: false });
                        socket.close();
                        console.error('Error parsing response:', error);
                    }
                }
            };

            socket.onerror = (error) => {
                const translateButtonState = useTranslateButtonStateNotifier.getState().state
                const pagerPos = usePagerPos.getState().pos
                if (pagerPos === 1) {
                    if (translateButtonState !== "repeat") {
                        switchTranslateButtonState("repeat");
                    }
                } else {
                    if (translateButtonState !== "next") {
                        switchTranslateButtonState("next");
                    }
                }
                console.error('WebSocket error:', error);
                set({ wsError: true, isConnected: false });
                socket.close();
                reject(error);
            };

            socket.onclose = (event) => {
                const translateButtonState = useTranslateButtonStateNotifier.getState().state
                const pagerPos = usePagerPos.getState().pos
                if (pagerPos === 1) {
                    if (translateButtonState !== "repeat") {
                        switchTranslateButtonState("repeat");
                    }
                } else {
                    if (translateButtonState !== "next") {
                        switchTranslateButtonState("next");
                    }
                }
                console.log('WebSocket connection closed:', event.code, event.reason);
                set({ isConnected: false });
            };

            set({ socket });
        });
    },

    disconnectWebSocket: () => {
        const { socket } = get();
        if (socket) {
            socket.close();
            set({ socket: null, isConnected: false });
        }
    },

    sendMessage: async (input: string) => {

        const inputLanguage = languagesPlusAutoDetect[useLanguageSelectorBottomSheetNotifier.getState().selectedIndex0.toString()];
        const targetLanguage = languages[useLanguageSelectorBottomSheetNotifier.getState().selectedIndex1.toString()];

        const { socket, isConnected } = get();
        const switchTranslateButtonState = useTranslateButtonStateNotifier.getState().switchState
        const translateButtonState = useTranslateButtonStateNotifier.getState().state
        if (translateButtonState !== "loading") {
            switchTranslateButtonState("loading");
        }

        set({
            lastTranslation: { inputLanguage, targetLanguage, input },
            tokens: new Map<number, Token>(),
            wsError: false
        });

        let currentSocket = socket;

        if (!currentSocket || !isConnected) {
            try {
                await get().connectWebSocket();
                currentSocket = get().socket;
            } catch (error) {
                console.error('Failed to connect WebSocket:', error);
                return;
            }
        }

        if (currentSocket && get().isConnected) {
            const translModeState = useTranslModeStore.getState().mode
            const message = {
                action: translModeState === "translate" ? "sapopinguino-translate" : "sapopinguino",
                message: JSON.stringify({
                    input_language: inputLanguage,
                    target_language: targetLanguage,
                    input: input
                })
            };
            currentSocket.send(JSON.stringify(message));
        }
    },

    repeatLastTranslation: () => {
        const { lastTranslation } = get();
        if (lastTranslation) {
            get().sendMessage(lastTranslation.input);
        }
    },

    stopStream: () => {
        const { socket } = get();
        if (socket) {
            socket.close();
        }
        const switchTranslateButtonState = useTranslateButtonStateNotifier.getState().switchState
        const translateButtonState = useTranslateButtonStateNotifier.getState().state
        const pagerPos = usePagerPos.getState().pos
        if (pagerPos === 1) {
            if (translateButtonState !== "repeat") {
                switchTranslateButtonState("repeat");
            }
        } else {
            if (translateButtonState !== "next") {
                switchTranslateButtonState("next");
            }
        }
        set({
            wsError: false,
            socket: null,
            isConnected: false,
        });
    },

    reset: () => {
        const { socket } = get();
        if (socket) {
            socket.close();
        }
        set({
            tokens: new Map<number, Token>(),
            wsError: false,
            socket: null,
            isConnected: false,
            lastTranslation: null
        });
    }
}));

export default useWebSocketStore;
