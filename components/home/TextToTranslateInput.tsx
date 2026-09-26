import { useEffect, useRef } from "react";
import { Alert, StyleSheet, TextInput } from "react-native"
import useTranslationInputStore from "@/stores/translationInputStore";
import useTransformationOperationStore from "@/stores/transformationOperationStore";
import { getCharacterCount, getInputLimit } from "@/utils/inputLimits";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import useLocalModelStore from "@/stores/localModelStore";
import useSubscriptionAccess from "@/hooks/useSubscriptionAccess";
import { TRANSLATION_TEXT_TYPOGRAPHY } from "@/constants/ui";

interface TextToTranslateInputProps {
    keyboardVerticalOffset: number;
}

const TextToTranslateInput = ({ keyboardVerticalOffset }: TextToTranslateInputProps) => {
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
        <KeyboardAvoidingView
            style={styles.innerContainer}
            behavior="padding"
            keyboardVerticalOffset={keyboardVerticalOffset}
            // Keep TextInput's JS press handler from forcing focus after a drag
            // or a tap that stops momentum. Native text gestures still handle editing.
            onStartShouldSetResponderCapture={() => true}
        >
            <TextInput
                style={styles.textInput}
                multiline
                value={text}
                onChangeText={handleTextChange}
                placeholder="Type something..."
                placeholderTextColor="#aaa"
                returnKeyType="done"
                submitBehavior="blurAndSubmit"
            />
        </KeyboardAvoidingView>
    )
}

const styles = StyleSheet.create({
    innerContainer: {
        flex: 1,
    },
    textInput: {
        flex: 1,
        ...TRANSLATION_TEXT_TYPOGRAPHY,
        textAlign: "left",
        textAlignVertical: "top",
        paddingHorizontal: 24,
        paddingVertical: 10,
        paddingBottom: 0,
        backgroundColor: "#fff",
    },
})

export default TextToTranslateInput
