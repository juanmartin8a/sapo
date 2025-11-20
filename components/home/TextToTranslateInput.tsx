import { useEffect, useRef, useState } from "react";
import { Alert, Keyboard, StyleSheet, TextInput } from "react-native"
import useTextToTranslateStore from "@/stores/textToTranslateStore";
import useTranslModeStore from "@/stores/translModeStore";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TextToTranslateInput = () => {
    const textInputRef = useRef<TextInput>(null);
    const text = useTextToTranslateStore((state) => state.text)
    const setText = useTextToTranslateStore((state) => state.setText)
    const inputLimit = useTranslModeStore((state) => state.inputLimit)
    const [isTextInputScrolling, setIsTextInputScrolling] = useState<boolean | null>(null);
    const scrollTimeout = useRef<NodeJS.Timeout | null>(null);
    const [tapStoppedScroll, setTapStoppedScroll] = useState(false)
    const hasAlertedRef = useRef(false)
    const isLimitReached = text.length >= inputLimit
    const insets = useSafeAreaInsets()

    useEffect(() => {
        if (isLimitReached && !hasAlertedRef.current) {
            hasAlertedRef.current = true
            Alert.alert('Input limit reached', 'This demo currently has a limit of 1000 characters for testing purposes')
        } else if (!isLimitReached && hasAlertedRef.current) {
            hasAlertedRef.current = false
        }
    }, [isLimitReached])

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
                onChangeText={setText}
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
                maxLength={inputLimit}
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
