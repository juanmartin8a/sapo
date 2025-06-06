import { useRef, useState, useEffect, useCallback } from "react";
import {
    StyleSheet,
    View,
    Animated,
    Keyboard,
} from "react-native";
import { GestureHandlerRootView, PanGestureHandler, PanGestureHandlerGestureEvent, TapGestureHandler } from "react-native-gesture-handler";
import PagerView from 'react-native-pager-view';
import SideBar, { SIDEBAR_WIDTH } from "@/components/sidebar/Sidebar";
import Translate from "@/components/home/Translate";
import LanguageSelectorBottomSheet from "../home/LanguageSelectorBottomSheet";
import { useSidebarIsOpenNotifier } from "@/stores";
import Header from "../header/Header";
import TextToTranslateInput from "../home/TextToTranslateInput";
import usePagerPos from "@/stores/pagerPosStore";

export default function Home() {
    const pagerRef = useRef<PagerView>(null);
    const slideSideBar = useRef<boolean | null>(null);
    const sideBarTranslationX = useRef(new Animated.Value(0)).current;
    let sideBarTranslationXValue = useRef(0)
    const [isSideBarPosAtStart, setIsSideBarPosAtStart] = useState(true);
    const isSideBarLastPosAtStart = useRef(true);

    const isSidebarOpenOrClosed = useSidebarIsOpenNotifier(state => state.isSidebarOpenOrClosed);

    const setOffset = usePagerPos(state => state.setOffset);
    const setPos = usePagerPos(state => state.setPos);

    const handleGestureEvent = useCallback((event: PanGestureHandlerGestureEvent) => {
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
    }, []);

    const handleGestureEnd = useCallback(() => {
        if (sideBarTranslationXValue.current > 0 || sideBarTranslationXValue.current < SIDEBAR_WIDTH) {
            if (slideSideBar.current === true) {
                Keyboard.dismiss();
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
    }, []);

    const handleContentGesture = useCallback((event: PanGestureHandlerGestureEvent) => {
        const { translationX, velocityX } = event.nativeEvent;

        if ((velocityX > 0 && translationX > 0) || !isSideBarPosAtStart) {
            handleGestureEvent(event);
        }
    }, [handleGestureEvent, isSideBarPosAtStart]);

    const handleContentGestureEnd = () => {
        handleGestureEnd();
    };

    useEffect(() => {
        const listenerId = sideBarTranslationX.addListener(({ value }) => {
            sideBarTranslationXValue.current = value;
            const isSidebarClosed = value === 0;
            setIsSideBarPosAtStart(isSidebarClosed);

            if (value === 0 || value === SIDEBAR_WIDTH) {
                isSideBarLastPosAtStart.current = isSidebarClosed;
                slideSideBar.current = null;

                isSidebarOpenOrClosed(!isSidebarClosed);
            }
        });

        return () => {
            sideBarTranslationX.removeListener(listenerId);
        };
    }, [isSidebarOpenOrClosed]);

    useEffect(() => {
        const unsubscribe = usePagerPos.subscribe(
            ({ newPos }, { newPos: prevNewPos }) => {
                if (newPos !== prevNewPos) {
                    pagerRef.current?.setPage(newPos);
                }
            }
        )

        return () => unsubscribe()
    }, [])

    return (
        <View
            style={styles.container}
        >
            <GestureHandlerRootView style={{ flex: 1 }}>
                <PanGestureHandler
                    onGestureEvent={handleContentGesture}
                    onEnded={handleContentGestureEnd}
                    simultaneousHandlers={pagerRef}
                    waitFor={pagerRef}
                >
                    <View style={{ flex: 1 }}>
                        <SideBar translationX={sideBarTranslationX} />

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
                                () => {
                                    Keyboard.dismiss();
                                    Animated.timing(sideBarTranslationX, {
                                        toValue: SIDEBAR_WIDTH,
                                        duration: 100,
                                        useNativeDriver: true,
                                    }).start()
                                    isSidebarOpenOrClosed(true)
                                }}
                            />
                            <PagerView
                                ref={pagerRef}
                                style={[styles.pagerView, { flex: 1 }]}
                                initialPage={0}
                                scrollEnabled={true}
                                overScrollMode="never"
                                orientation="horizontal"
                                onPageScroll={(e) => {
                                    setOffset(e.nativeEvent.offset)
                                }}
                                onPageSelected={(e) => {
                                    setPos(e.nativeEvent.position)
                                }}
                            >
                                <View key="1" style={[, { width: "100%", height: "100%" }]}>
                                    <TextToTranslateInput />
                                </View>

                                <View key="2" style={[, { width: "100%", height: "100%" }]}>
                                    <Translate />
                                </View>
                            </PagerView>
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
                                    <View style={styles.mainContentOverlay} />
                                </TapGestureHandler>
                            }
                        </Animated.View>
                    </View>
                </PanGestureHandler>
                <LanguageSelectorBottomSheet />
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
    pagerView: {
        flex: 1,
    },
});
