import { useEffect, useRef, useState } from "react";
import { Alert, Keyboard, StyleSheet, TextInput } from "react-native"
import useTextToTranslateStore from "@/stores/textToTranslateStore";
import useTransformationOperationStore from "@/stores/transformationOperationStore";
import useSubscriptionStatusStore from "@/stores/subscriptionStatusStore";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const trimTextToLimit = (text: string, limit: number) => {
    return Array.from(text).slice(0, limit).join("")
}

const TextToTranslateInput = () => {
    const textInputRef = useRef<TextInput>(null);
    const text = useTextToTranslateStore((state) => state.text)
    const setText = useTextToTranslateStore((state) => state.setText)
    const operation = useTransformationOperationStore((state) => state.operation)
    const hasActiveSubscription = useSubscriptionStatusStore((state) => state.hasActiveSubscription)
    const [isTextInputScrolling, setIsTextInputScrolling] = useState<boolean | null>(null);
    const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [tapStoppedScroll, setTapStoppedScroll] = useState(false)
    const hasAlertedRef = useRef(false)
    const inputLimit = hasActiveSubscription === false ? 10 : (operation === "respell" ? 300 : 1000)
    const textLength = Array.from(text).length
    const isLimitReached = textLength >= inputLimit
    const insets = useSafeAreaInsets()

    const handleChangeText = (nextText: string) => {
        setText(Array.from(nextText).length > inputLimit ? trimTextToLimit(nextText, inputLimit) : nextText)
    }

    useEffect(() => {
        if (textLength > inputLimit) {
            setText(trimTextToLimit(text, inputLimit))
        }
    }, [inputLimit, setText, text, textLength])

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

    const handleScroll = () => {
        if (textInputRef.current?.isFocused() === false) {
            setIsTextInputScrolling(true);

            if (scrollTimeout.current) {
                clearTimeout(scrollTimeout.current);
            }

            scrollTimeout.current = setTimeout(() => {
                setIsTextInputScrolling(false);
            }, 100);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.innerContainer}
            behavior="padding"
            keyboardVerticalOffset={insets.top + 60 + 16}
        >
            <TextInput
                ref={textInputRef}
                style={[styles.textInput]}
                multiline
                value={text}
                onChangeText={handleChangeText}
                placeholder="Type something..."
                placeholderTextColor="#aaa"
                returnKeyType="done"
                onScroll={() => {
                    if (textInputRef.current?.isFocused() === false) {
                        handleScroll()
                    }
                }}
                onTouchStart={() => {
                    if (isTextInputScrolling === true) {
                        setTapStoppedScroll(true)
                    }
                }}
                onTouchEnd={() => {
                    setTapStoppedScroll(false)
                }}
                submitBehavior="blurAndSubmit"
                onSubmitEditing={() => Keyboard.dismiss()}
                editable={((!isTextInputScrolling && !tapStoppedScroll) || Keyboard.isVisible())}// && isSideBarPosAtStart}
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
