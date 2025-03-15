import React, { useEffect, useRef, useState } from "react";
import {
    StyleSheet,
    View,
    Keyboard,
    Text,
    Animated,
    TextInput,
    TouchableWithoutFeedback,
    Dimensions,
} from "react-native";
import { GestureHandlerRootView, PanGestureHandler, PanGestureHandlerGestureEvent, TapGestureHandler} from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Reanimated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
} from 'react-native-reanimated';
import SideBar, { SIDEBAR_WIDTH } from "@/components/sidebar/Sidebar";
import SidebarIcon from "../../assets/icons/sidebar.svg"

export default function Home() {
    const [text, setText] = useState("");
    const insets = useSafeAreaInsets();
    const textInputRef = useRef<TextInput>(null);
    const [isTextInputScrolling, setIsTextInputScrolling] = useState<boolean | null>(null);
    const slideSideBar = useRef<boolean | null>(null);
    const sideBarTranslationX = useRef(new Animated.Value(0)).current;
    let sideBarTranslationXValue = useRef(0)
    const [isSideBarPosAtStart, setIsSideBarPosAtStart] = useState(true);
    const isSideBarLastPosAtStart = useRef(true);
    const scrollTimeout = useRef<NodeJS.Timeout | null>(null);
    const [tapStoppedScroll, setTapStoppedScroll] = useState(false)
    
    const SCREEN_WIDTH = Dimensions.get('window').width;
    const slideRightPanel = useRef<boolean | null>(null);
    const rightPanelTranslationX = useRef(new Animated.Value(0)).current;
    let rightPanelTranslationXValue = useRef(0);
    const [isRightPanelVisible, setIsRightPanelVisible] = useState(false);
    const isRightPanelLastPosAtStart = useRef(true);


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
    
    const handleContentGesture = (event: PanGestureHandlerGestureEvent) => {
        const { translationX, velocityX } = event.nativeEvent;
        
        if ((velocityX > 0 && translationX > 0) || !isSideBarPosAtStart) {
            handleGestureEvent(event);
            return;
        }
        
        let stillnessThreshold: number = 0;
        if (isRightPanelLastPosAtStart.current) { 
            stillnessThreshold = 12;
        } else if (!isRightPanelLastPosAtStart.current) {
            stillnessThreshold = -12;
        }
        
        const newPosition = Math.max(-SCREEN_WIDTH, Math.min(0, 
            (isRightPanelLastPosAtStart.current ? 0 : -SCREEN_WIDTH) + 
            (translationX - stillnessThreshold)
        ));
        
        rightPanelTranslationX.setValue(newPosition);
        
        if (velocityX <= 0 && slideRightPanel.current !== true) {
            slideRightPanel.current = true;
        } else if (velocityX > 0 && slideRightPanel.current !== false) {
            slideRightPanel.current = false;
        }
    };
    
    const handleContentGestureEnd = (event: PanGestureHandlerGestureEvent) => {
        const { velocityX } = event.nativeEvent;
        
        if (!isSideBarPosAtStart || velocityX > 0) {
            handleGestureEnd();
            return;
        }
        
        if (rightPanelTranslationXValue.current > -SCREEN_WIDTH && rightPanelTranslationXValue.current < 0) {
            if (slideRightPanel.current === true) {
                Animated.timing(rightPanelTranslationX, {
                    toValue: -SCREEN_WIDTH,
                    duration: 200,
                    useNativeDriver: true,
                }).start();
            } else if (slideRightPanel.current === false) {
                Animated.timing(rightPanelTranslationX, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                }).start();
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

        const rightPanelListenerId = rightPanelTranslationX.addListener(({ value }) => {
            rightPanelTranslationXValue.current = value;
            setIsRightPanelVisible(value !== 0);
            if (value === 0 || value === -SCREEN_WIDTH) {
                isRightPanelLastPosAtStart.current = value === 0;
                slideRightPanel.current = null;
            }
        });

        return () => {
            sideBarTranslationX.removeListener(listenerId);
            rightPanelTranslationX.removeListener(rightPanelListenerId);
        }; 
    });

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
        <View
            style={styles.container}
        >
        <GestureHandlerRootView style={{ flex: 1 }}>
            <PanGestureHandler 
                onGestureEvent={handleContentGesture}
                onEnded={handleContentGestureEnd}
            >
                <View style={{ flex: 1 }}>
                    <SideBar translationX={sideBarTranslationX}/>
                    
                    <Animated.View
                        style={[
                            styles.mainContent,
                            { 
                                transform: [
                                    { translateX: sideBarTranslationX },
                                ],
                            }
                        ]}
                    >
                        <View style={[styles.header, {height: 60 + insets.top, paddingTop: insets.top}]}>
                            <View style={{position: "absolute", height: "100%", left: 18, top: insets.top, justifyContent:"center"}}>
                                <TouchableWithoutFeedback onPress={() => {
                                    Animated.timing(sideBarTranslationX, {
                                        toValue: SIDEBAR_WIDTH,
                                        duration: 100,
                                        useNativeDriver: true,
                                    }).start()
                                    return
                                }}>
                                    <View style={{padding: 6}}>
                                        <SidebarIcon width={40} height={32} stroke="black"/>
                                    </View>
                                </TouchableWithoutFeedback>
                            </View>
                            <Text style={styles.titleText}>
                                {"S.A.P.O"}
                            </Text>
                            
                            <View style={{position: "absolute", height: "100%", right: 18, top: insets.top, justifyContent:"center"}}>
                                <TouchableWithoutFeedback onPress={() => {
                                    Animated.timing(rightPanelTranslationX, {
                                        toValue: -SCREEN_WIDTH,
                                        duration: 200,
                                        useNativeDriver: true,
                                    }).start()
                                    return
                                }}>
                                    <View style={{padding: 6}}>
                                        <Text style={styles.rightPanelButton}>→</Text>
                                    </View>
                                </TouchableWithoutFeedback>
                            </View>
                        </View>
                        
                        <View style={styles.textInputContainer}>
                            {/* Text Input with sliding */}
                            <Animated.View
                                style={[
                                    styles.textInputWrapper,
                                    {
                                        transform: [
                                            { translateX: rightPanelTranslationX }
                                        ],
                                        width: SCREEN_WIDTH * 2,
                                        flexDirection: "row"
                                    }
                                ]}
                            >
                                <Reanimated.View style={[styles.innerContainer, animatedStyles, {width: SCREEN_WIDTH}]}>
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
                                    onSubmitEditing={dismissKeyboard}
                                    editable={((!isTextInputScrolling && !tapStoppedScroll) || Keyboard.isVisible()) && isSideBarPosAtStart}
                                />
                                </Reanimated.View>

                                <View style={[
                                    styles.rightPanel,
                                        { left: SCREEN_WIDTH, backgroundColor: "red", width: SCREEN_WIDTH }
                                ]}>
                                    <View style={styles.rightPanelContent}>
                                        <Text style={styles.rightPanelTitle}>Additional Panel</Text>
                                        <TouchableWithoutFeedback onPress={() => {
                                            Animated.timing(rightPanelTranslationX, {
                                                toValue: 0,
                                                duration: 200,
                                                useNativeDriver: true,
                                            }).start()
                                        }}>
                                            <View style={styles.closeButton}>
                                                <Text style={styles.closeButtonText}>Close</Text>
                                            </View>
                                        </TouchableWithoutFeedback>
                                    </View>
                                </View>
                            </Animated.View>
                            
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
        flexDirection: "column"
    },
    mainContentOverlay: {
        position: "absolute",
        zIndex: 2,
        width: "100%",
        height: "100%",
    },
    titleText: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    header: {
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center'
    },
    contentContainer: {
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
    },
    textInputContainer: {
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
    },
    textInputWrapper: {
        flex: 1,
    },
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
    rightPanel: {
        position: 'absolute',
        // top: 0,
        // height: '100%',
        flex:1,
        backgroundColor: '#f0f0f0',
        zIndex: 1,
    },
    rightPanelContent: {
        flex: 1,
        padding: 20,
        alignItems: 'center',
    },
    rightPanelTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
    },
    rightPanelButton: {
        fontSize: 24,
        fontWeight: 'bold',
    },
    closeButton: {
        backgroundColor: '#e0e0e0',
        padding: 10,
        borderRadius: 8,
        marginTop: 20,
    },
    closeButtonText: {
        fontSize: 16,
        fontWeight: 'bold',
    },
});

