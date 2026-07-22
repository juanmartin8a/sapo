import { useEffect, useRef } from "react";
import { Alert, StyleSheet, TextInput } from "react-native"
import useTranslationInputStore from "@/stores/translationInputStore";
import useTransformationOperationStore from "@/stores/transformationOperationStore";
import useSubscriptionStatusStore from "@/stores/subscriptionStatusStore";
import { authClient } from "@/lib/auth-client";
import { getSessionUserAuthState } from "@/utils/auth";
import { getCharacterCount, getInputLimit } from "@/utils/inputLimits";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TextToTranslateInput = () => {
    const text = useTranslationInputStore((state) => state.text)
    const setText = useTranslationInputStore((state) => state.setText)
    const operation = useTransformationOperationStore((state) => state.operation)
    const subscriptionUserId = useSubscriptionStatusStore((state) => state.userId)
    const hasActiveSubscription = useSubscriptionStatusStore((state) => state.hasActiveSubscription)
    const { data: session, isPending: isAuthPending } = authClient.useSession()
    const authState = getSessionUserAuthState(session?.user)
    const effectiveSubscriptionStatus = isAuthPending
        ? null
        : authState !== "authenticated"
          ? false
          : subscriptionUserId === session?.user?.id
            ? hasActiveSubscription
            : null
    const hasAlertedRef = useRef(false)
    const inputLimit = getInputLimit(operation, effectiveSubscriptionStatus)
    const textLength = getCharacterCount(text)
    const isLimitReached = inputLimit !== null && textLength >= inputLimit
    const insets = useSafeAreaInsets();

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
        <KeyboardAvoidingView
            style={styles.innerContainer}
            behavior="padding"
            keyboardVerticalOffset={insets.top+60+16} 
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
        justifyContent: "flex-start",
    },
    textInput: {
        fontSize: 36,
        textAlign: "left",
        textAlignVertical: "top",
        paddingHorizontal: 24,
        paddingVertical: 10,
        width: "100%",
        height: "100%",
        backgroundColor: "#fff",
    },
})

export default TextToTranslateInput
