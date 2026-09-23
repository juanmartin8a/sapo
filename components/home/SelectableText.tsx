import { useRef, type Ref } from "react";
import { Platform, StyleSheet, Text, TextInput, View, type TextProps } from "react-native";

type Props = Pick<TextProps, "style" | "onTextLayout" | "accessibilityLabel" | "accessibilityActions" | "onAccessibilityAction"> & {
    text: string;
    inputRef?: Ref<TextInput>;
    onDismissSelection?: () => void;
    onInteractionStart?: () => void;
    onUnselectedTap?: () => void;
};

export default function SelectableText({ text, inputRef, style, onTextLayout, accessibilityLabel,
    accessibilityActions, onAccessibilityAction, onDismissSelection, onInteractionStart, onUnselectedTap }: Props) {
    const hasSelection = useRef(false);
    const tap = useRef<{ x: number; y: number; startedAt: number; selected: boolean } | null>(null);

    if (Platform.OS !== "ios") {
        return <Text selectable style={style} onTextLayout={onTextLayout} accessibilityLabel={accessibilityLabel}>{text || "\u200B"}</Text>;
    }

    return <View>
        {/* Text determines the complete height and line positions; the native field provides selection. */}
        <Text accessible={false} pointerEvents="none" onTextLayout={onTextLayout} style={[style, styles.measurement]}>
            {text || "\u200B"}
        </Text>
        <TextInput
            ref={inputRef}
            accessibilityLabel={accessibilityLabel}
            accessibilityActions={accessibilityActions}
            onAccessibilityAction={onAccessibilityAction}
            value={text}
            multiline
            editable={false}
            scrollEnabled={false}
            showSoftInputOnFocus={false}
            caretHidden
            onSelectionChange={({ nativeEvent: { selection } }) => {
                hasSelection.current = selection.start !== selection.end;
                // Preserve native selection creation and handle dragging.
                if (hasSelection.current) tap.current = null;
            }}
            onTouchStart={event => {
                event.stopPropagation();
                onInteractionStart?.();
                const { pageX, pageY, touches } = event.nativeEvent;
                tap.current = touches.length === 1
                    ? { x: pageX, y: pageY, startedAt: event.timeStamp, selected: hasSelection.current }
                    : null;
            }}
            onTouchMove={event => {
                const start = tap.current;
                if (start && Math.hypot(event.nativeEvent.pageX - start.x, event.nativeEvent.pageY - start.y) > 8) {
                    tap.current = null;
                }
            }}
            onTouchEnd={event => {
                const start = tap.current;
                tap.current = null;
                if (!start || event.timeStamp - start.startedAt >= 200
                    || Math.hypot(event.nativeEvent.pageX - start.x, event.nativeEvent.pageY - start.y) > 8) return;
                if (start.selected) {
                    hasSelection.current = false;
                    onDismissSelection?.();
                } else {
                    onUnselectedTap?.();
                }
            }}
            onTouchCancel={() => { tap.current = null; }}
            style={[styles.color, style, styles.input]}
        />
    </View>;
}

const styles = StyleSheet.create({
    color: { color: "#000" },
    measurement: { opacity: 0 },
    input: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, padding: 0, margin: 0 },
});
