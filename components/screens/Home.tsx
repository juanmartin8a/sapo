import { useRef, useState, useEffect, useCallback } from "react";
import { StyleSheet, View, Keyboard } from "react-native";
import { GestureHandlerRootView, PanGestureHandler, PanGestureHandlerGestureEvent, TapGestureHandler } from "react-native-gesture-handler";
import PagerView from 'react-native-pager-view';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    useAnimatedReaction,
    runOnJS,
    Easing
} from 'react-native-reanimated';
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
    const sideBarTranslationX = useSharedValue(0);
    const isAnimating = useSharedValue(false);

    const [isSideBarPosAtStart, setIsSideBarPosAtStart] = useState(true);
    const isSideBarLastPosAtStart = useRef(true);

    const isSidebarOpenOrClosed = useSidebarIsOpenNotifier(state => state.isSidebarOpenOrClosed);
    const setOffset = usePagerPos(state => state.setOffset);
    const setPos = usePagerPos(state => state.setPos);

    const openSidebar = useCallback(() => {
        if (isAnimating.value) return;
        isAnimating.value = true;
        runOnJS(Keyboard.dismiss)();
        sideBarTranslationX.value = withTiming(
            SIDEBAR_WIDTH,
            { duration: 500, easing: Easing.bezier(0.23, 1, 0.32, 1) },
            (isFinished) => {
                if (isFinished) {
                    isAnimating.value = false;
                }
            }
        );
    }, []);

    const closeSidebar = useCallback(() => {
        if (isAnimating.value) return;
        isAnimating.value = true;
        sideBarTranslationX.value = withTiming(
            0,
            { duration: 500, easing: Easing.bezier(0.23, 1, 0.32, 1) },
            (isFinished) => {
                if (isFinished) {
                    isAnimating.value = false;
                }
            }
        );
    }, []);

    const updateJsState = useCallback((value: number) => {
        const isSidebarClosed = value === 0;
        setIsSideBarPosAtStart(isSidebarClosed);

        if (value === 0 || value === SIDEBAR_WIDTH) {
            isSideBarLastPosAtStart.current = isSidebarClosed;
            slideSideBar.current = null;
            isSidebarOpenOrClosed(!isSidebarClosed);
        }
    }, [isSidebarOpenOrClosed]);

    useAnimatedReaction(
        () => sideBarTranslationX.value,
        (currentValue, previousValue) => {
            if (currentValue !== previousValue) {
                runOnJS(updateJsState)(currentValue);
            }
        },
        [updateJsState]
    );

    const handleGestureEvent = useCallback((event: PanGestureHandlerGestureEvent) => {
        const { translationX, velocityX } = event.nativeEvent;

        let stillnessThreshold: number;
        if (isSideBarLastPosAtStart.current) {
            stillnessThreshold = -12;
        } else {
            stillnessThreshold = 12;
        }

        const newPosition = Math.max(0, Math.min(SIDEBAR_WIDTH, (isSideBarLastPosAtStart.current ? 0 : SIDEBAR_WIDTH) + (translationX + stillnessThreshold)));

        sideBarTranslationX.value = newPosition;

        if (velocityX >= 0 && slideSideBar.current !== true) {
            slideSideBar.current = true;
        } else if (velocityX < 0 && slideSideBar.current !== false) {
            slideSideBar.current = false;
        }
    }, []);

    const handleGestureEnd = useCallback(() => {
        if (isAnimating.value) return;

        if (sideBarTranslationX.value > 0 && sideBarTranslationX.value < SIDEBAR_WIDTH) {
            if (slideSideBar.current === true) {
                openSidebar();
                return;
            } else if (slideSideBar.current === false) {
                closeSidebar();
                return;
            }
        }
    }, [openSidebar, closeSidebar]);

    const handleContentGesture = useCallback((event: PanGestureHandlerGestureEvent) => {
        if (isAnimating.value) {
            return;
        }

        const { translationX, velocityX } = event.nativeEvent;

        if ((velocityX > 0 && translationX > 0) || !isSideBarPosAtStart) {
            handleGestureEvent(event);
        }
    }, [handleGestureEvent, isSideBarPosAtStart, isAnimating]);

    useEffect(() => {
        const unsubscribe = usePagerPos.subscribe(
            ({ newPos }, { newPos: prevNewPos }) => {
                // console.log("hello there")
                // console.log("new pos: ", newPos)
                // console.log("prev new pos: ", prevNewPos)
                if (newPos !== prevNewPos) {
                    pagerRef.current?.setPage(newPos);
                }
            }
        );
        return () => unsubscribe();
    }, []);

    const mainContentAnimatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateX: sideBarTranslationX.value }],
        };
    });

    return (
        <View style={styles.container}>
            <GestureHandlerRootView style={{ flex: 1 }}>
                <PanGestureHandler
                    onGestureEvent={handleContentGesture}
                    onEnded={handleGestureEnd}
                    simultaneousHandlers={pagerRef}
                    waitFor={pagerRef}
                >
                    <View style={{ flex: 1 }}>
                        <SideBar translationX={sideBarTranslationX} />

                        <Animated.View style={[styles.mainContent, mainContentAnimatedStyle]}>
                            <Header onSidebarPress={openSidebar} />
                            <PagerView
                                ref={pagerRef}
                                style={styles.pagerView}
                                initialPage={0}
                                scrollEnabled={true}
                                overScrollMode="never"
                                orientation="horizontal"
                                onPageScroll={(e) => setOffset(e.nativeEvent.offset)}
                                onPageSelected={(e) => {
                                    console.log(e.nativeEvent.position)
                                    setPos(e.nativeEvent.position)
                                }}
                            >
                                <View key="1" style={{ width: "100%", height: "100%" }}>
                                    <TextToTranslateInput />
                                </View>
                                <View key="2" style={{ width: "100%", height: "100%" }}>
                                    <Translate />
                                </View>
                            </PagerView>
                            {!isSideBarPosAtStart && (
                                <TapGestureHandler maxDurationMs={2000} shouldCancelWhenOutside={false} onEnded={closeSidebar}>
                                    <View style={styles.mainContentOverlay} />
                                </TapGestureHandler>
                            )}
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
        backgroundColor: "rgba(0,0,0,0)"
    },
    pagerView: {
        flex: 1,
    },
});
