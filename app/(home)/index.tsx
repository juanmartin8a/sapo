import React, { useRef, useState } from "react";
import {
    StyleSheet,
    View,
    KeyboardAvoidingView,
    Keyboard,
    Platform,
    Text,
} from "react-native";
import { GestureHandlerRootView, PanGestureHandler, PanGestureHandlerGestureEvent, TextInput } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function Home() {
    const [text, setText] = useState("");
    const insets = useSafeAreaInsets();
    const textInputRef = useRef(null);
    const [isSliding, setIsSliding] = useState(false);

    const dismissKeyboard = () => {
        Keyboard.dismiss();
    };

    const handleGestureEvent = (event: PanGestureHandlerGestureEvent) => {
        const { translationY, translationX } = event.nativeEvent;
        setIsSliding(translationX > 0 || translationY > 0)
    };

    const handleGestureEnd = () => {
        setIsSliding(false);
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
        <View style={[styles.header, {height: 60 + insets.top, paddingTop: insets.top}]}>
            <Text style={styles.titleText}>
                {"S.A.P.O"}
            </Text>
        </View>
        <GestureHandlerRootView style={{ flex: 1 }}>
            <PanGestureHandler 
                onGestureEvent={handleGestureEvent}
                onEnded={handleGestureEnd}
                simultaneousHandlers={textInputRef}
            >
                <View style={styles.innerContainer}>
                    <TextInput
                        ref={textInputRef}
                        style={[styles.textInput, {height: '100%'}]}
                        multiline
                        value={text}
                        onChangeText={setText}
                        scrollEnabled={true}
                        placeholder="Type something..."
                        placeholderTextColor="#aaa"
                        returnKeyType="done"
                        submitBehavior="blurAndSubmit" 
                        onSubmitEditing={dismissKeyboard}
                        editable={!isSliding}
                    />
                </View>
            </PanGestureHandler>
        </GestureHandlerRootView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
    },
    titleText: {
        fontSize: 20,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    header: {
        width: '100%',
        justifyContent: 'center'
    },
    innerContainer: {
        flex: 1,
        justifyContent: "flex-start",
    },
    textInput: {
        fontSize: 36,
        lineHeight: 36,
        textAlign: "left",
        textAlignVertical: "top",
        paddingHorizontal: 25,
        paddingVertical: 10,
        width: "100%",
        backgroundColor: "#fff",
    },
});

