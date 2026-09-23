import SelectableText from "./SelectableText";
import { useEffect, useRef, useState, type Ref } from "react";
import { Pressable, ScrollView, Text, TextInput, View, Platform, StyleSheet, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";

export default function TranslationPreview({ text, inputRef, onDismissSelection, onInteractionStart }: {
    text: string;
    inputRef?: Ref<TextInput>;
    onDismissSelection?: () => void;
    onInteractionStart?: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
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
    const toggleExpanded = () => {
        onDismissSelection?.();
        setExpanded(value => !value);
    };
    const visibleText = expanded ? text : text.replace(/[\r\n\u2028\u2029]+/g, " ");
    const preview = Platform.OS === "ios" ? (
        <SelectableText
            text={visibleText}
            inputRef={inputRef}
            accessibilityLabel="Translation preview"
            accessibilityActions={[{ name: "toggleExpanded", label: expanded ? "Collapse translation" : "Expand translation" }]}
            onAccessibilityAction={event => {
                if (event.nativeEvent.actionName === "toggleExpanded") toggleExpanded();
            }}
            style={styles.text}
            onDismissSelection={onDismissSelection}
            onInteractionStart={onInteractionStart}
            onUnselectedTap={toggleExpanded}
        />
    ) : (
        <Pressable onPress={toggleExpanded} accessibilityRole="button" accessibilityLabel="Translation preview"
            accessibilityHint={expanded ? "Double tap to collapse to one line" : "Double tap to show the full translation vertically"}>
            <Text selectable style={styles.text}>{visibleText}</Text>
        </Pressable>
    );
    if (expanded) return <View style={styles.expanded}>{preview}</View>;

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
    >
        {preview}
    </ScrollView>;
}
const styles = StyleSheet.create({
    strip: { height: 40, flexGrow: 0, marginHorizontal: -24, },
    content: { paddingHorizontal: 24 },
    expanded: { marginHorizontal: -24, paddingHorizontal: 24, marginBottom: 8 },
    text: {  fontSize: 24, lineHeight: 29, opacity: 0.25 },
});
