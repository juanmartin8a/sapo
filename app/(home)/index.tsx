import React, { useEffect, useRef, useState } from "react";
import {
    StyleSheet,
    View,
    Keyboard,
    Text,
    Animated,
} from "react-native";
import { GestureHandlerRootView, PanGestureHandler, PanGestureHandlerGestureEvent, TapGestureHandler, TextInput } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Reanimated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
} from 'react-native-reanimated';
import SideBar, { SIDEBAR_WIDTH } from "@/components/SideBar/SideBar";

export default function Home() {
    const [text, setText] = useState("");
    const insets = useSafeAreaInsets();
    const textInputRef = useRef(null);
    const [isTextInputScrolling, setIsTextInputScrolling] = useState<boolean | null>(null);
    const slideSideBar = useRef<boolean | null>(null);
    const sideBarTranslationX = useRef(new Animated.Value(0)).current;
    let sideBarTranslationXValue = useRef(0)
    const [isSideBarPosAtStart, setIsSideBarPosAtStart] = useState(true);
    const isSideBarLastPosAtStart = useRef(true);

    const dismissKeyboard = () => {
        Keyboard.dismiss();
    };

    const handleGestureEvent = (event: PanGestureHandlerGestureEvent) => {
        const { translationX, velocityX } = event.nativeEvent;


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
    };

    const handleGestureEnd = () => {
        if (sideBarTranslationXValue.current > 0 || sideBarTranslationXValue.current < SIDEBAR_WIDTH) {
            if (slideSideBar.current === true) {
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
            sideBarTranslationXValue.current = value;
            setIsSideBarPosAtStart(value === 0)
            if (value === 0 || value === SIDEBAR_WIDTH) {
                isSideBarLastPosAtStart.current = value === 0
                slideSideBar.current = null;
            }
        });

        return () => sideBarTranslationX.removeListener(listenerId); 
    });

  const keyboard = useAnimatedKeyboard();

  const animatedStyles = useAnimatedStyle(() => ({
    marginBottom: keyboard.height.value,
  }));

    return (
        <View
            style={styles.container}
        >
        <GestureHandlerRootView style={{ flex: 1 }}>
            <PanGestureHandler 
                onGestureEvent={handleGestureEvent}
                onEnded={handleGestureEnd}
            >
                <View style={{ flex: 1 }}>
                    <SideBar translationX={sideBarTranslationX}/>
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
                                    if (isTextInputScrolling === false) {
                                        setIsTextInputScrolling(true)
                                    }
                                }}
                                onTouchStart={() => setIsTextInputScrolling(false)}
                                onTouchEnd={() => setIsTextInputScrolling(null)}
                                submitBehavior="blurAndSubmit" 
                                onSubmitEditing={dismissKeyboard}
                                editable={(!isTextInputScrolling || Keyboard.isVisible()) && isSideBarPosAtStart}
                            />
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
                            </Reanimated.View>
                    </Animated.View>
                </View>
            </PanGestureHandler>
        </GestureHandlerRootView>
    </View>
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
        flexDirection: "column"
    },
    mainContentOverlay: {
        position: "absolute",
        width: "100%",
        height: "100%",
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
        height: "100%",
        backgroundColor: "#fff",
    },
});

