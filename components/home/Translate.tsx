import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, NativeSyntheticEvent, TextLayoutEventData } from 'react-native';
import useWebSocketStore from '../../stores/websocketStore';
import SapoIcon from "../../assets/icons/sapo.svg"
import SapoBocaAbiertaIcon from "../../assets/icons/sapo_boca_abierta.svg"
import { SCREEN_WIDTH } from '@gorhom/bottom-sheet';

interface CursorPos {
    x: number;
    y: number;
}

export default function Translate() {
    const {
        tokens,
        wsError,
        disconnectWebSocket,
    } = useWebSocketStore();

    const [cursorPos, setCursorPos] = useState<CursorPos>({ x: 0, y: 0 });
    const sapoWidth = SCREEN_WIDTH * 0.4;
    const sapoHeight = sapoWidth * (800 / 929);
    const sapoBocaAbiertaHeight = sapoWidth * (914 / 929);
    const [sapoMouthOpen, setSapoMouthOpen] = useState<boolean>(false)
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!tokens) return;

        const tokenArray = Array.from(tokens.entries())

        const lastToken = tokenArray[tokenArray.length - 1]?.[1]

        if (lastToken?.type === 'word' || lastToken?.type === "translate") {
            if (sapoMouthOpen) {
                clearTimeout(timeoutRef.current);
                setSapoMouthOpen(false);
            }

            setSapoMouthOpen(true);

            timeoutRef.current = setTimeout(() => {
                setSapoMouthOpen(false);
                timeoutRef.current = null;
            }, 100);
        }
    }, [tokens]);

    useEffect(() => {
        return () => {
            disconnectWebSocket();
        };
    }, []);

    const onTextLayout = (e: NativeSyntheticEvent<TextLayoutEventData>) => {
        const newLines = e.nativeEvent.lines.map((ln) => ({
            width: ln.width,
            height: ln.height,
        }));

        const last = newLines[newLines.length - 1];
        const y = newLines
            .slice(0, newLines.length - 1)
            .reduce((sum, l) => sum + l.height, 0);

        if (last.width < (SCREEN_WIDTH - sapoWidth)) {
            setCursorPos({ x: last.width, y: y })
        } else {
            setCursorPos({ x: last.width, y: y + last.height })
        }

    };

    return (
        <ScrollView>
            <View style={styles.container}>
                <View style={styles.textContainer}>
                    {wsError ? (
                        <Text style={styles.errorText}>An error occurred </Text>
                    ) : (
                        <Text
                            onTextLayout={onTextLayout}
                            style={styles.translatedText}
                            selectable={true}>
                            {
                                tokens.size > 0
                                    ? Array.from(tokens.entries()).map(([key, value]) => {
                                        return <Text key={key}>{value.type === 'word' ? value.output : value.value}</Text>
                                    })
                                    : "\u200B"
                            }
                        </Text>
                    )}
                </View>
                <View style={{
                    marginTop: 10,
                    position: "absolute",
                    justifyContent: 'flex-end',
                    height: sapoBocaAbiertaHeight,
                    transform: [
                        { translateX: SCREEN_WIDTH - (sapoWidth - (sapoWidth * 0.23)) },
                        { translateY: cursorPos.y },
                        { scaleX: -1 }
                    ]
                }}>
                    <View style={{ position: "relative" }}>
                        <SapoIcon
                            width={sapoWidth}
                            height={sapoHeight}
                            style={{ bottom: 0, left: 0, opacity: sapoMouthOpen ? 0 : 1 }}
                        />
                        <SapoBocaAbiertaIcon
                            width={sapoWidth}
                            height={sapoBocaAbiertaHeight}
                            style={{ position: 'absolute', bottom: 0, left: 0, opacity: sapoMouthOpen ? 1 : 0 }}
                        />
                    </View>

                </View>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 24,
        paddingVertical: 10,
        width: "100%",
        borderTopRightRadius: '20',
        borderBottomRightRadius: '20',
        backgroundColor: '#fff',
    },
    textContainer: {
        width: "100%",
        backgroundColor: '#fff',
    },
    translatedText: {
        // fontSize: 32,
        // lineHeight: 32 * 1.2,
        fontSize: 24,
        lineHeight: 24 * 1.2,
        textAlign: "left",
        textAlignVertical: "top",
        width: "100%",
        backgroundColor: "#fff",
        // fontFamily: "Tangerine_400Regular",
        fontFamily: "Times New Roman",
        fontWeight: "400",
    },
    errorText: {
        color: 'red',
        fontSize: 16,
    },
});
