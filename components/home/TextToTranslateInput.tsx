import { useEffect, useRef } from "react";
import { Alert, StyleSheet, TextInput } from "react-native"
import useTranslationInputStore from "@/stores/translationInputStore";
import useTransformationOperationStore from "@/stores/transformationOperationStore";
import { getCharacterCount, getInputLimit } from "@/utils/inputLimits";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import useLocalModelStore from "@/stores/localModelStore";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useSubscriptionAccess from "@/hooks/useSubscriptionAccess";

const TextToTranslateInput = () => {
    const insets = useSafeAreaInsets();
    const text = useTranslationInputStore((state) => state.text)
    const textLength = useTranslationInputStore((state) => state.characterCount)
    const setText = useTranslationInputStore((state) => state.setText)
    const operation = useTransformationOperationStore((state) => state.operation)
    const { hasActiveSubscription } = useSubscriptionAccess()
    const isLocalModelEnabled = useLocalModelStore((state) => state.isEnabled)
    const hasAlertedRef = useRef(false)
    const inputLimit = getInputLimit(operation, hasActiveSubscription, isLocalModelEnabled)
    const isLimitExceeded = inputLimit !== null && textLength > inputLimit
    const handleTextChange = (nextText: string) => {
        const nextTextLength = getCharacterCount(nextText)

        if (inputLimit !== null && nextTextLength > inputLimit) {
            if (nextTextLength < textLength) {
                setText(nextText, nextTextLength)
                return
            }

            if (hasAlertedRef.current) {
                return
            }

            hasAlertedRef.current = true
            const operationLabel = operation === "respell" ? "respelling" : "translating"
            Alert.alert(
                "Input limit reached",
                `You can use up to ${inputLimit} characters while ${operationLabel}.`
            )
            return
        }

        hasAlertedRef.current = false
        setText(nextText, nextTextLength)
    }

    useEffect(() => {
        if (inputLimit !== null && isLimitExceeded && !hasAlertedRef.current) {
            hasAlertedRef.current = true
            const operationLabel = operation === "respell" ? "respelling" : "translating"
            Alert.alert(
                "Input limit reached",
                `You can use up to ${inputLimit} characters while ${operationLabel}.`
            )
        } else if (!isLimitExceeded && hasAlertedRef.current) {
            hasAlertedRef.current = false
        }
    }, [inputLimit, isLimitExceeded, operation])

    return (
        <KeyboardAwareScrollView
            style={styles.innerContainer}
            contentContainerStyle={styles.contentContainer}
            bottomOffset={12}
        >
            <TextInput
                style={[styles.textInput, {paddingBottom: 10 + 24 + insets.bottom}]}
                multiline
                value={text}
                onChangeText={handleTextChange}
                rejectResponderTermination={false}
                placeholder="Type something..."
                placeholderTextColor="#aaa"
                returnKeyType="done"
                submitBehavior="blurAndSubmit"
            />
        </KeyboardAwareScrollView>
    )
}

const styles = StyleSheet.create({
    innerContainer: {
        flex: 1,
    },
    contentContainer: {
        flexGrow: 1,
    },
    textInput: {
        flex: 1,
        fontSize: 24,
        lineHeight: 24 * 1.2,
        textAlign: "left",
        textAlignVertical: "top",
        paddingHorizontal: 24,
        paddingVertical: 10,
        backgroundColor: "#fff",
    },
})

export default TextToTranslateInput
