import { useEffect, useRef } from "react";
import { Alert, StyleSheet, TextInput } from "react-native"
import useTranslationInputStore from "@/stores/translationInputStore";
import useTransformationOperationStore from "@/stores/transformationOperationStore";
import useSubscriptionStatusStore from "@/stores/subscriptionStatusStore";
import { useAuthState } from "@/providers/AuthStateProvider";
import { getCharacterCount, getInputLimit } from "@/utils/inputLimits";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import useLocalModelStore from "@/stores/localModelStore";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TextToTranslateInput = () => {
    const insets = useSafeAreaInsets();
    const text = useTranslationInputStore((state) => state.text)
    const setText = useTranslationInputStore((state) => state.setText)
    const operation = useTransformationOperationStore((state) => state.operation)
    const subscriptionUserId = useSubscriptionStatusStore((state) => state.userId)
    const hasActiveSubscription = useSubscriptionStatusStore((state) => state.hasActiveSubscription)
    const { status: authStatus, userId } = useAuthState()
    const isLocalModelEnabled = useLocalModelStore((state) => state.isEnabled)
    const effectiveSubscriptionStatus = authStatus === "checking"
        ? null
        : authStatus !== "authenticated"
          ? false
          : subscriptionUserId === userId
            ? hasActiveSubscription
            : null
    const hasAlertedRef = useRef(false)
    const inputLimit = getInputLimit(operation, effectiveSubscriptionStatus, isLocalModelEnabled)
    const textLength = getCharacterCount(text)
    const isLimitReached = inputLimit !== null && textLength >= inputLimit
    const handleTextChange = (nextText: string) => {
        if (inputLimit !== null && getCharacterCount(nextText) > inputLimit) {
            const operationLabel = operation === "respell" ? "respelling" : "translating"
            Alert.alert(
                "Input limit reached",
                `You can use up to ${inputLimit} characters while ${operationLabel}.`
            )
            return
        }

        setText(nextText)
    }

    useEffect(() => {
        if (inputLimit !== null && isLimitReached && !hasAlertedRef.current) {
            hasAlertedRef.current = true
            const operationLabel = operation === "respell" ? "respelling" : "translating"
            Alert.alert(
                "Input limit reached",
                `You can use up to ${inputLimit} characters while ${operationLabel}.`
            )
        } else if (!isLimitReached && hasAlertedRef.current) {
            hasAlertedRef.current = false
        }
    }, [inputLimit, isLimitReached, operation])

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
