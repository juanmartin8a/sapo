import { useRef, useState } from "react";
import { Keyboard, StyleSheet, TextInput } from "react-native"
import Reanimated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
} from 'react-native-reanimated';
import useTextToTranslateStore from "@/stores/textToTranslateStore";

const TextToTranslateInput = () => {
    const textInputRef = useRef<TextInput>(null);
    const text = useTextToTranslateStore((state) => state.text)
    const setText = useTextToTranslateStore((state) => state.setText)
    const [isTextInputScrolling, setIsTextInputScrolling] = useState<boolean | null>(null);
    const scrollTimeout = useRef<NodeJS.Timeout | null>(null);
    const [tapStoppedScroll, setTapStoppedScroll] = useState(false)

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

    const keyboard = useAnimatedKeyboard();

    const animatedStyles = useAnimatedStyle(() => ({
        marginBottom: keyboard.height.value,
    }));

    return (
        <Reanimated.View style={[styles.innerContainer, animatedStyles]}>
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
                editable={((!isTextInputScrolling && !tapStoppedScroll) || Keyboard.isVisible()) }// && isSideBarPosAtStart}
            />
        </Reanimated.View>
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
