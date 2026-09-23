import TranslationPreview from './TranslationPreview';
import SelectableText from './SelectableText';
import { useEffect, useRef, type Ref } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, NativeSyntheticEvent, NativeScrollEvent, TextLayoutEventData, LayoutChangeEvent, useWindowDimensions } from 'react-native';
import Animated, {
    cancelAnimation,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withTiming,
} from 'react-native-reanimated';
import useTranslationStore from '@/stores/translationStore';
import { triggerLightImpactHaptic } from '@/lib/haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const frogTopOffset = 10;

export default function Translate({ responseInputRef, previewInputRef, onDismissSelection, onDismissPreviewSelection }: {
    responseInputRef?: Ref<TextInput>;
    previewInputRef?: Ref<TextInput>;
    onDismissPreviewSelection?: () => void;
    onDismissSelection?: () => void;
}) {
    const insets = useSafeAreaInsets();
    const { width: screenWidth } = useWindowDimensions();
    const translationPreview = useTranslationStore(state => state.translationPreview);
    const isCombinedResponse = useTranslationStore(state => state.isCombinedResponse);
    const displayText = useTranslationStore((state) => state.displayText);
    const mouthTriggerVersion = useTranslationStore((state) => state.mouthTriggerVersion);
    const streamStartVersion = useTranslationStore((state) => state.streamStartVersion);
    const streamError = useTranslationStore((state) => state.streamError);
    const streamErrorMessage = useTranslationStore((state) => state.streamErrorMessage);
    const isStreaming = useTranslationStore((state) => state.isStreaming);
    const disconnectStream = useTranslationStore((state) => state.disconnectStream);

    const sapoWidth = screenWidth * 0.4;
    const sapoHeight = sapoWidth * (800 / 929);
    const sapoBocaAbiertaHeight = sapoWidth * (914 / 929);
    const cursorY = useSharedValue(0);
    const mouthOpen = useSharedValue(0);
    const hasMountedRef = useRef(false);
    const wasStreamingRef = useRef(false);
    const streamStartVersionRef = useRef(0);
    const scrollViewRef = useRef<ScrollView>(null);
    const shouldStickToBottomRef = useRef(true);
    const textContainerHeightRef = useRef(0);
    const wrappedLineBottomRef = useRef<number | null>(null);

    useEffect(() => {
        if (!hasMountedRef.current) {
            hasMountedRef.current = true;
            return;
        }

        mouthOpen.set(1);
        mouthOpen.set(withDelay(100, withTiming(0, { duration: 0 })));

        return () => {
            cancelAnimation(mouthOpen);
        };
    }, [mouthOpen, mouthTriggerVersion]);

    useEffect(() => {
        if (wasStreamingRef.current && !isStreaming) {
            triggerLightImpactHaptic();
        }
        wasStreamingRef.current = isStreaming;
    }, [isStreaming]);

    useEffect(() => {
        if (streamStartVersionRef.current !== streamStartVersion) {
            triggerLightImpactHaptic();
            streamStartVersionRef.current = streamStartVersion;
        }
    }, [streamStartVersion]);

    useEffect(() => {
        return () => {
            disconnectStream();
        };
    }, [disconnectStream]);

    const frogAnimatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: screenWidth - 24 - (sapoWidth - (sapoWidth * 0.23)) },
            { translateY: cursorY.get() },
            { scaleX: -1 },
        ],
    }));
    const closedMouthAnimatedStyle = useAnimatedStyle(() => ({
        opacity: 1 - mouthOpen.get(),
    }));
    const openMouthAnimatedStyle = useAnimatedStyle(() => ({
        opacity: mouthOpen.get(),
    }));

    useEffect(() => {
        if (!displayText) {
            cursorY.set(0);
            shouldStickToBottomRef.current = true;
            wrappedLineBottomRef.current = null;
        }
    }, [displayText, cursorY]);

    const onTextLayout = (e: NativeSyntheticEvent<TextLayoutEventData>) => {
        if (!displayText) return;

        const lines = e.nativeEvent.lines;
        const last = lines[lines.length - 1];

        if (!last) {
            return;
        }

        if (last.width < (screenWidth - sapoWidth)) {
            wrappedLineBottomRef.current = null;
            cursorY.set(last.y);
        } else {
            wrappedLineBottomRef.current = last.y + last.height;
            cursorY.set(Math.max(wrappedLineBottomRef.current, textContainerHeightRef.current) - frogTopOffset);
        }
    };

    const onTextContainerLayout = (e: LayoutChangeEvent) => {
        textContainerHeightRef.current = e.nativeEvent.layout.height;
        if (wrappedLineBottomRef.current !== null) {
            cursorY.set(Math.max(wrappedLineBottomRef.current, textContainerHeightRef.current) - frogTopOffset);
        }
    };

    const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
        shouldStickToBottomRef.current =
            contentOffset.y + layoutMeasurement.height >= contentSize.height - 2;
    };

    const onContentSizeChange = () => {
        if (shouldStickToBottomRef.current) {
            scrollViewRef.current?.scrollToEnd({ animated: false });
        }
    };

    return (
        <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            onScroll={onScroll}
            onContentSizeChange={onContentSizeChange}
            scrollEventThrottle={16}
        >
            <View style={[styles.container, { paddingBottom: sapoBocaAbiertaHeight + 10 + 24 + insets.bottom }]}>
                {isCombinedResponse && translationPreview.length > 0 && <TranslationPreview text={translationPreview} inputRef={previewInputRef} onDismissSelection={onDismissPreviewSelection} onInteractionStart={onDismissSelection} />}
                <View style={{ position: 'relative' }}>
                    <View style={styles.textContainer} onLayout={onTextContainerLayout}>
                        {streamError ? (
                            <Text style={styles.errorText}>{streamErrorMessage ?? "An error occurred"}</Text>
                        ) : (
                            <SelectableText
                                text={displayText}
                                inputRef={responseInputRef}
                                accessibilityLabel="Response"
                                onTextLayout={onTextLayout}
                                onDismissSelection={onDismissSelection}
                                onInteractionStart={onDismissPreviewSelection}
                                style={styles.translatedText}
                            />
                        )}
                    </View>
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            styles.frog,
                            { height: sapoBocaAbiertaHeight },
                            frogAnimatedStyle,
                        ]}
                    >
                        <View style={{ position: "relative" }}>
                            <Animated.Image
                                source={require("@/assets/images/sapo.png")}
                                resizeMode="contain"
                                style={[
                                    styles.frogImage,
                                    { width: sapoWidth, height: sapoHeight },
                                    closedMouthAnimatedStyle,
                                ]}
                            />
                            <Animated.Image
                                source={require("@/assets/images/sapo-mouth-open.png")}
                                resizeMode="contain"
                                style={[
                                    styles.frogImage,
                                    styles.openMouthImage,
                                    { width: sapoWidth, height: sapoBocaAbiertaHeight },
                                    openMouthAnimatedStyle,
                                ]}
                            />
                        </View>
                    </Animated.View>
                </View>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
    },
    container: {
        flexGrow: 1,
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
    frog: {
        position: "absolute",
        top: frogTopOffset,
        justifyContent: "flex-end",
    },
    frogImage: {
        bottom: 0,
        left: 0,
    },
    openMouthImage: {
        position: "absolute",
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
