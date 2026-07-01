import { useEffect, useRef } from "react";
import { Alert, StyleSheet, TextInput } from "react-native"
import useTextToTranslateStore from "@/stores/textToTranslateStore";
import useTransformationOperationStore from "@/stores/transformationOperationStore";
import useSubscriptionStatusStore from "@/stores/subscriptionStatusStore";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const trimTextToLimit = (text: string, limit: number) => {
    return Array.from(text).slice(0, limit).join("")
}

const TextToTranslateInput = () => {
    const text = useTextToTranslateStore((state) => state.text)
    const setText = useTextToTranslateStore((state) => state.setText)
    const operation = useTransformationOperationStore((state) => state.operation)
    const hasActiveSubscription = useSubscriptionStatusStore((state) => state.hasActiveSubscription)
    const hasAlertedRef = useRef(false)
    const inputLimit = hasActiveSubscription === false ? 10 : (operation === "respell" ? 300 : 1000)
    const textLength = Array.from(text).length
    const isLimitReached = textLength >= inputLimit
    const insets = useSafeAreaInsets();

    // useEffect(() => {
    //     if (textLength > inputLimit) {
    //         setText(trimTextToLimit(text, inputLimit))
    //     }
    // }, [inputLimit, setText, text, textLength])

    useEffect(() => {
        if (isLimitReached && !hasAlertedRef.current) {
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
                onChangeText={setText}
                maxLength={inputLimit}
                // maxLength={1000}
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
