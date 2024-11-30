import React, { useRef, useState } from "react";
import {
    StyleSheet,
    View,
    KeyboardAvoidingView,
    Keyboard,
    Platform,
    Text,
    Animated,
    Dimensions,
} from "react-native";
import { GestureHandlerRootView, HandlerStateChangeEvent, PanGestureHandler, PanGestureHandlerGestureEvent, TextInput } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SIDEBAR_WIDTH = SCREEN_WIDTH * 0.7;

export default function Home() {
    const [text, setText] = useState("");
    const insets = useSafeAreaInsets();
    const textInputRef = useRef(null);
    const [isMoving, setIsMoving] = useState(false);
    const [slideSideBar, setSlideSideBar] = useState<boolean | null>(null);
    const sideBarTranslationX = useRef(new Animated.Value(0)).current;
    let currentEndSideBarPos = useRef(0);

    const dismissKeyboard = () => {
        Keyboard.dismiss();
    };

    const handleGestureEvent = (event: PanGestureHandlerGestureEvent) => {
        const { translationY, translationX, velocityX } = event.nativeEvent;
        setIsMoving(translationX > 0 || translationY > 0)

        const newPosition = Math.max(0, Math.min(SIDEBAR_WIDTH, currentEndSideBarPos.current + translationX));

        sideBarTranslationX.setValue(newPosition);

        if (velocityX > 10) {
            setSlideSideBar(true);
        } else if (velocityX < -10) {
            setSlideSideBar(false)
        }
    };

    const handleGestureEnd = () => {
        setIsMoving(false);

        if (slideSideBar === true) {
            Animated.timing(sideBarTranslationX, {
                toValue: SIDEBAR_WIDTH,
                duration: 100,
                useNativeDriver: true,
            }).start()
            setSlideSideBar(null)
            currentEndSideBarPos.current = SIDEBAR_WIDTH
            console.log("toromax: ",currentEndSideBarPos)
            return
        } else if (slideSideBar === false) {  
            Animated.timing(sideBarTranslationX, {
                toValue: 0,
                duration: 100,
                useNativeDriver: true,
            }).start()
            setSlideSideBar(null)
            currentEndSideBarPos.current = 0 
            return
        }
        
        if (sideBarTranslationX._value !== 0 && sideBarTranslationX._value !== SIDEBAR_WIDTH) {
            if (sideBarTranslationX._value > SIDEBAR_WIDTH * 0.25) {
                Animated.timing(sideBarTranslationX, {
                    toValue: SIDEBAR_WIDTH,
                    duration: 100,
                    useNativeDriver: true,
                }).start()
                currentEndSideBarPos.current = SIDEBAR_WIDTH 
                // .start(() => {
                //     setIsSidebarOpen(shouldOpen);
                // });
            } else {
                Animated.timing(sideBarTranslationX, {
                    toValue: 0,
                    duration: 100,
                    useNativeDriver: true,
                }).start()
                currentEndSideBarPos.current = 0 
            }
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
        <GestureHandlerRootView style={{ flex: 1 }}>
            <PanGestureHandler 
                onGestureEvent={handleGestureEvent}
                onEnded={handleGestureEnd}
                simultaneousHandlers={textInputRef}
            >
                <View style={{ flex: 1 }}>
                    <Animated.View
                        style={[
                            styles.sideBar,
                            {
                                transform: [{ translateX: Animated.add(-SIDEBAR_WIDTH, sideBarTranslationX) }],
                            },
                        ]}
                    >
                    </Animated.View>
                    <Animated.View
                        style={[
                            styles.mainContent,
                            { 
                                transform: [{ translateX: sideBarTranslationX }],
                            }
                        ]}
                    >
                        <View style={[styles.header, {height: 60 + insets.top, paddingTop: insets.top}]}>
                            <Text style={styles.titleText}>
                                {"S.A.P.O"}
                            </Text>
                        </View>
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
                                editable={!isMoving}
                            />
                        </View>
                    </Animated.View>
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
    mainContent: {
        flex: 1,
        backgroundColor: "#fff",
        zIndex: 2,
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
    sideBar: {
        position: "absolute",
        height: "100%",
        width: SIDEBAR_WIDTH,
        backgroundColor: "#f8f8f8",
        zIndex: 1,
        padding: 20,
        transform: [
            { translateX: -SIDEBAR_WIDTH }
        ]
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

