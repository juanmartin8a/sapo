import SelectableText from "./SelectableText";
import { TRANSLATION_TEXT_TYPOGRAPHY } from "@/constants/ui";
import { useState, type Ref } from "react";
import { Pressable, Text, TextInput, View, StyleSheet } from "react-native";
export default function TranslationPreview({ text, inputRef, onDismissSelection, onInteractionStart }: {
    text: string;
    inputRef?: Ref<TextInput>;
    onDismissSelection?: () => void;
    onInteractionStart?: () => void;
}) {
    const [expanded, setExpanded] = useState(true);
    const toggleExpanded = () => {
        onDismissSelection?.();
        onInteractionStart?.();
        setExpanded(value => !value);
    };

    return (
        <View style={styles.container}>
            {expanded ? (
                <SelectableText
                    text={text}
                    inputRef={inputRef}
                    accessibilityLabel="Translation"
                    style={styles.text}
                    onDismissSelection={onDismissSelection}
                    onInteractionStart={onInteractionStart}
                />
            ) : (
                <Text
                    selectable
                    numberOfLines={2}
                    ellipsizeMode="tail"
                    accessibilityLabel="Translation preview"
                    onPressIn={onInteractionStart}
                    style={styles.text}
                >
                    {text}
                </Text>
            )}
            <View>
                <Pressable
                    onPress={toggleExpanded}
                    accessibilityRole="button"
                    accessibilityLabel={expanded ? "Show less translation" : "Show full translation"}
                    accessibilityState={{ expanded }}
                    hitSlop={10}
                    style={styles.toggle}
                >
                    <Text style={styles.toggleText}>{expanded ? "Show less" : "Show translation"}</Text>
                    <View accessible={false} style={[styles.chevron, expanded && styles.chevronExpanded]} />
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { marginBottom: 8 },
    text: { ...TRANSLATION_TEXT_TYPOGRAPHY, color: '#aaa' },
    toggle: { paddingTop: 4, flexDirection: 'row', alignItems: 'flex-start', alignSelf: 'flex-start', gap: 8 },
    toggleText: { fontSize: 14, lineHeight: 20, color: '#aaa', textDecorationLine: 'underline' },
    chevron: { width: 7, height: 7, borderRightWidth: 1.5, borderBottomWidth: 1.5, borderColor: '#aaa', transform: [{ rotate: '45deg' }], marginTop: 5 },
    chevronExpanded: { transform: [{ rotate: '225deg' }], marginTop: 8 },
});
