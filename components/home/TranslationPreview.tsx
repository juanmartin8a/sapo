import { useEffect, useRef } from "react";
import { ScrollView, Text, StyleSheet, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";

export default function TranslationPreview({ text }: { text: string }) {
    const scroll = useRef<ScrollView>(null);
    const follow = useRef(true);
    const interacting = useRef(false);
    useEffect(() => {
        if (!text) {
            follow.current = true;
            interacting.current = false;
            scroll.current?.scrollTo({ x: 0, animated: false });
        }
    }, [text]);
    const updateFollow = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
        follow.current = contentOffset.x + layoutMeasurement.width >= contentSize.width - 2;
    };
    return <ScrollView
        ref={scroll}
        horizontal
        style={styles.strip}
        contentContainerStyle={styles.content}
        showsHorizontalScrollIndicator
        onScrollBeginDrag={() => { interacting.current = true; follow.current = false; }}
        onScroll={event => {
            if (!interacting.current) return;
            updateFollow(event);
        }}
        onScrollEndDrag={event => { updateFollow(event); interacting.current = false; }}
        onMomentumScrollBegin={() => { interacting.current = true; }}
        onMomentumScrollEnd={event => { updateFollow(event); interacting.current = false; }}
        onContentSizeChange={() => {
            if (follow.current) scroll.current?.scrollToEnd({ animated: false });
        }}
        scrollEventThrottle={16}
        accessibilityLabel="Translation preview"
    >
        <Text selectable style={styles.text}>
            {text.replace(/[\r\n\u2028\u2029]+/g, " ")}
        </Text>
    </ScrollView>;
}
const styles = StyleSheet.create({
    strip: { height: 40, flexGrow: 0, marginHorizontal: -24, marginBottom: 8 },
    content: { paddingHorizontal: 24 },
    text: { fontFamily: "Times New Roman", fontSize: 24, lineHeight: 29, opacity: 0.5 },
});
