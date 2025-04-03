import { useRef, useState, useEffect } from "react";
import {
    StyleSheet,
    View,
    Keyboard,
    Animated,
} from "react-native";
import { GestureHandlerRootView, PanGestureHandler, PanGestureHandlerGestureEvent, TapGestureHandler} from "react-native-gesture-handler";
import PagerView from 'react-native-pager-view';
import SideBar, { SIDEBAR_WIDTH } from "@/components/sidebar/Sidebar";
import Translate from "@/components/home/Translate";
import LanguageSelectorBottomSheet from "../home/LanguageSelectorBottomSheet";
import { useSidebarIsOpenNotifier } from "@/stores";
import useWebSocketStore from "@/stores/websocketStore";
import { languages, languagesPlusAutoDetect } from "@/constants/languages";
import useLanguageSelectorBottomSheetNotifier from "@/stores/languageSelectorBottomSheetNotifierStore";
import useTextToTranslateStore from "@/stores/textToTranslateStore";
import Header from "../header/Header";
import TextToTranslateInput from "../home/TextToTranslateInput";

export default function Home() {
    const text = useTextToTranslateStore((state) => state.text)
    const pagerRef = useRef<PagerView>(null);
    const slideSideBar = useRef<boolean | null>(null);
    const sideBarTranslationX = useRef(new Animated.Value(0)).current;
    let sideBarTranslationXValue = useRef(0)
    const [isSideBarPosAtStart, setIsSideBarPosAtStart] = useState(true);
    const isSideBarLastPosAtStart = useRef(true);
    
    const [currentPage, setCurrentPage] = useState(0);

    // Get the sidebar state update function
    const isSidebarOpenOrClosed = useSidebarIsOpenNotifier(state => state.isSidebarOpenOrClosed);

    const sendMessage = useWebSocketStore((state) => state.sendMessage)

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
        // If the sidebar is open or we're trying to open it, handle that gesture
        const { translationX, velocityX } = event.nativeEvent;
        
        if ((velocityX > 0 && translationX > 0) || !isSideBarPosAtStart) {
            handleGestureEvent(event);
        }
    };
    
    const handleContentGestureEnd = () => {
        handleGestureEnd();
    };

    // Track sidebar position
    useEffect(() => {
        // requestAnimationFrame(() => pagerRef.current?.setPage(0));
        const listenerId = sideBarTranslationX.addListener(({ value }) => {
            sideBarTranslationXValue.current = value;
            const isSidebarClosed = value === 0;
            setIsSideBarPosAtStart(isSidebarClosed);
            
            if (value === 0 || value === SIDEBAR_WIDTH) {
                isSideBarLastPosAtStart.current = isSidebarClosed;
                slideSideBar.current = null;
                
                // Update the sidebar state in the store
                isSidebarOpenOrClosed(!isSidebarClosed);
            }
        });

        return () => {
            sideBarTranslationX.removeListener(listenerId);
        }; 
    }, [isSidebarOpenOrClosed]);

    const next = () => {
        sendMessage(
           languagesPlusAutoDetect[useLanguageSelectorBottomSheetNotifier.getState().selectedIndex0.toString()],
           languages[useLanguageSelectorBottomSheetNotifier.getState().selectedIndex1.toString()], 
           text
        )
        pagerRef.current?.setPage(1);
        setCurrentPage(1);
    };

    const goToMainPanel = () => {
        pagerRef.current?.setPage(0);
        setCurrentPage(0);
    };

    return (
        <View
            style={styles.container}
        >
          <GestureHandlerRootView style={{flex:1}}>
            <PanGestureHandler 
                onGestureEvent={handleContentGesture}
                onEnded={handleContentGestureEnd}
                simultaneousHandlers={pagerRef}
                waitFor={pagerRef}
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
                        <Header onSidebarPress={
                            () => {Animated.timing(sideBarTranslationX, {
                                        toValue: SIDEBAR_WIDTH,
                                        duration: 100,
                                        useNativeDriver: true,
                                    }).start()
                                    isSidebarOpenOrClosed(true)
                        }}
                        onNextPress={next}
                        /> 
                        
                        <View style={styles.pagerContainer}>
                            <PagerView
                                ref={pagerRef}
                                style={[styles.pagerView, {flex: 1}]}
                                initialPage={0}
                                scrollEnabled={true}
                                overScrollMode="never"
                                orientation="horizontal"
                                onPageSelected={(e) => setCurrentPage(e.nativeEvent.position)}
                            >
                                {/* Main Page */}
                                <View key="1" style={[, {width: "100%", height: "100%"}]}>
                                    <TextToTranslateInput />
                                </View>

                                <View key="2" style={[, { width: "100%", height:"100%"}]}>
                                    <View style={styles.rightPanelContent}>
                                        <Translate />
                                    </View>
                                </View>
                            </PagerView>
                        </View>
                        
                        {
                            !isSideBarPosAtStart &&
                            <TapGestureHandler maxDurationMs={2000} shouldCancelWhenOutside={false} onEnded={() => {
                                Animated.timing(sideBarTranslationX, {
                                    toValue: 0,
                                    duration: 100,
                                    useNativeDriver: true,
                                }).start()
                                isSidebarOpenOrClosed(false)
                                return
                            }}>
                                <View style={styles.mainContentOverlay}/>
                            </TapGestureHandler>
                        }
                    </Animated.View>
                </View>
            </PanGestureHandler>
            <LanguageSelectorBottomSheet/>
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
    pagerContainer: {
        flex: 1,
    },
    pagerView: {
        flex: 1,
    },
    textInputWrapper: {
        flex: 1,
    },
    rightPanel: {
        flex: 1,
    },
    rightPanelContent: {
        flex: 1,
    },
    rightPanelTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
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
