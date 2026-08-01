import { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, TextInput } from "react-native"
import useTranslationInputStore from "@/stores/translationInputStore";
import useTransformationOperationStore from "@/stores/transformationOperationStore";
import useSubscriptionStatusStore from "@/stores/subscriptionStatusStore";
import { useAuthState } from "@/providers/AuthStateProvider";
import { getCharacterCount, getInputLimit } from "@/utils/inputLimits";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useLocalModelStore from "@/stores/localModelStore";

const TextToTranslateInput = () => {
    const textInputRef = useRef<TextInput>(null)
    const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const touchEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isScrollingRef = useRef(false)
    const [isScrolling, setIsScrolling] = useState(false)
    const [touchStartedWhileScrolling, setTouchStartedWhileScrolling] = useState(false)
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

    useEffect(() => () => {
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
        if (touchEndTimeoutRef.current) clearTimeout(touchEndTimeoutRef.current)
    }, [])

    const handleScroll = () => {
        if (textInputRef.current?.isFocused()) return

        isScrollingRef.current = true
        setIsScrolling(true)

        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
        scrollTimeoutRef.current = setTimeout(() => {
            isScrollingRef.current = false
            setIsScrolling(false)
        }, 100)
    }

    const handleTouchEnd = () => {
        if (touchEndTimeoutRef.current) clearTimeout(touchEndTimeoutRef.current)
        touchEndTimeoutRef.current = setTimeout(() => {
            setTouchStartedWhileScrolling(false)
        }, 0)
    }

    return (
        <KeyboardAvoidingView
            style={styles.innerContainer}
            behavior="padding"
            keyboardVerticalOffset={insets.top+60+16} 
        >
            <TextInput
                ref={textInputRef}
                style={styles.textInput}
                multiline
                value={text}
                onChangeText={handleTextChange}
                onScroll={handleScroll}
                onTouchStart={() => {
                    if (touchEndTimeoutRef.current) clearTimeout(touchEndTimeoutRef.current)
                    if (isScrollingRef.current) setTouchStartedWhileScrolling(true)
                }}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                editable={!isScrolling && !touchStartedWhileScrolling}
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
