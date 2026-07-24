import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, NativeSyntheticEvent, TextLayoutEventData, Dimensions } from 'react-native';
import useTranslationStore from '@/stores/translationStore';
import SapoIcon from "../../assets/icons/sapo.svg"
import SapoBocaAbiertaIcon from "../../assets/icons/sapo_boca_abierta.svg"
import { triggerSoftSelectionHaptic } from '@/lib/haptics';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface CursorPos {
    x: number;
    y: number;
}

export default function Translate() {
    const displayText = useTranslationStore((state) => state.displayText);
    const mouthTriggerVersion = useTranslationStore((state) => state.mouthTriggerVersion);
    const streamError = useTranslationStore((state) => state.streamError);
    const streamErrorMessage = useTranslationStore((state) => state.streamErrorMessage);
    const disconnectStream = useTranslationStore((state) => state.disconnectStream);

    const [cursorPos, setCursorPos] = useState<CursorPos>({ x: 0, y: 0 });
    const sapoWidth = SCREEN_WIDTH * 0.4;
    const sapoHeight = sapoWidth * (800 / 929);
    const sapoBocaAbiertaHeight = sapoWidth * (914 / 929);
    const [sapoMouthOpen, setSapoMouthOpen] = useState<boolean>(false)
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasMountedRef = useRef(false);

    useEffect(() => {
        if (!hasMountedRef.current) {
            hasMountedRef.current = true;
            return;
        }

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
            setSapoMouthOpen(true);
            triggerSoftSelectionHaptic();

            timeoutRef.current = setTimeout(() => {
                setSapoMouthOpen(false);
                timeoutRef.current = null;
            }, 100);
        }, 0);

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };
    }, [mouthTriggerVersion]);

    useEffect(() => {
        return () => {
            disconnectStream();
        };
    }, [disconnectStream]);

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
                    {streamError ? (
                        <Text style={styles.errorText}>{streamErrorMessage ?? "An error occurred"}</Text>
                    ) : (
                        <Text
                            onTextLayout={onTextLayout}
                            style={styles.translatedText}
                            selectable={true}>
                            {displayText.length > 0 ? displayText : "\u200B"}
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
        fontSize: 24,
        lineHeight: 24 * 1.2,
        textAlign: "left",
        textAlignVertical: "top",
        width: "100%",
        backgroundColor: "#fff",
        fontFamily: "Times New Roman",
        fontWeight: "400",
    },
    errorText: {
        color: 'red',
        fontSize: 16,
    },
});
