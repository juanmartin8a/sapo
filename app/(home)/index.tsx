import React, { useEffect, useRef, useState } from "react";
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
import { GestureHandlerRootView, PanGestureHandler, PanGestureHandlerGestureEvent, TapGestureHandler, TextInput } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SIDEBAR_WIDTH = SCREEN_WIDTH * 0.7;

export default function Home() {
    const [text, setText] = useState("");
    const insets = useSafeAreaInsets();
    const textInputRef = useRef(null);
    const [isTextInputScrolling, setIsTextInputScrolling] = useState(false);
    // const [isMoving, setIsMoving] = useState(false);
    const slideSideBar = useRef<boolean | null>(null);
    const sideBarTranslationX = useRef(new Animated.Value(0)).current;
    let sideBarTranslationXValue = useRef(0)
    const [isSideBarPosAtStart, setIsSideBarPosAtStart] = useState(true);
    const isSideBarLastPosAtStart = useRef(true);
    // const keyboardIsOpening = useRef()

    const dismissKeyboard = () => {
        Keyboard.dismiss();
    };

    const handleGestureEvent = (event: PanGestureHandlerGestureEvent) => {
        const { translationX, velocityX } = event.nativeEvent;

        if (!isTextInputScrolling) {

            let stillnessThreshold: number
            if (isSideBarLastPosAtStart.current) { 
                stillnessThreshold = -12
            } else if (!isSideBarLastPosAtStart.current) {
                stillnessThreshold = 12
            }

            const newPosition = Math.max(0, Math.min(SIDEBAR_WIDTH, (isSideBarLastPosAtStart.current ? 0 : SIDEBAR_WIDTH) + (translationX + stillnessThreshold!)));

            sideBarTranslationX.setValue(newPosition);

            if (velocityX >= 0 && slideSideBar.current !== true) {
                slideSideBar.current = true;
            } else if (velocityX < 0 && slideSideBar.current !== false) {
                slideSideBar.current = false;
            }
        }
    };

    const handleGestureEnd = () => {
        if (sideBarTranslationXValue.current > 0 || sideBarTranslationXValue.current < SIDEBAR_WIDTH) {
            if (slideSideBar.current === true) {
                console.log("heyy")
                Animated.timing(sideBarTranslationX, {
                toValue: SIDEBAR_WIDTH,
                duration: 100,
                useNativeDriver: true,
                }).start()
                return
            } else if (slideSideBar.current === false) {  
                Animated.timing(sideBarTranslationX, {
                toValue: 0,
                duration: 100,
                useNativeDriver: true,
                }).start()
                return
            }
        }
    };

    useEffect(() => {
        const listenerId = sideBarTranslationX.addListener(({ value }) => {
            console.log(value)
            sideBarTranslationXValue.current = value;
            setIsSideBarPosAtStart(value === 0)
            if (value === 0 || value === SIDEBAR_WIDTH) {
                isSideBarLastPosAtStart.current = value === 0
                slideSideBar.current = null;
            }
        });

        return () => sideBarTranslationX.removeListener(listenerId); // Cleanup
    });

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
        <GestureHandlerRootView style={{ flex: 1 }}>
            <PanGestureHandler 
                onGestureEvent={handleGestureEvent}
                onEnded={handleGestureEnd}
                simultaneousHandlers={isSideBarPosAtStart ? textInputRef : undefined}
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
                                value="saposaposapos aposaposaposapos aposaposaps paspaosapsapos paosoaospoa pspasopaospaospas oapospasopaospao spaospaospao sapospaospaos paospaosp aospaos wilfnvskjdhfv skhfvbskfjhv svcsufhkbsfb vshbvsef vsfhv sf bcvsf cvuhksgfebcvhwe cshbvshjkvs dvhsdfvbsdfbvshjbvshjdfkv sdvhsdfbvjhsdfbvjhsdfvbsfd vjhksb vhjbvkhsjfbvkjsf dvksdfh vjsfd vjhsbvsjdkf vbsdfvhksdfbvsdfbvsdfbvs efvkjsdbvhsbvjhksdfv bsfdvhbkjsdfbvkj vhkjsdfbvksv uhsdfbvkjsdf vjskfbhvsdfbv jksdf vhjsfdbvsdfj vj"
                                onChangeText={setText}
                                scrollEnabled={true}
                                placeholder="Type something..."
                                placeholderTextColor="#aaa"
                                onScroll={() => {setIsTextInputScrolling(true)}}
                                onTouchEnd={() => {setIsTextInputScrolling(false)}}
                                returnKeyType="done"
                                submitBehavior="blurAndSubmit" 
                                onSubmitEditing={dismissKeyboard}
                                editable={(!isTextInputScrolling || Keyboard.isVisible()) && isSideBarPosAtStart}
                            />
                        </View>
                        {
                            !isSideBarPosAtStart &&
                            <TapGestureHandler maxDurationMs={2000} shouldCancelWhenOutside={false} onEnded={() => {
                                Animated.timing(sideBarTranslationX, {
                                    toValue: 0,
                                    duration: 100,
                                    useNativeDriver: true,
                                }).start()
                                return
                            }}>
                            <View style={styles.mainContentOverlay}/>
                            </TapGestureHandler>
                        }
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
    mainContentOverlay: {
        position: "absolute",
        width: "100%",
        height: "100%",
        // backgroundColor: "red",
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

