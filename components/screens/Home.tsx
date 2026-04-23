import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { StyleSheet, View, Keyboard, Text, TouchableWithoutFeedback } from "react-native";
import { GestureHandlerRootView, GestureDetector, Gesture } from "react-native-gesture-handler";
import PagerView from 'react-native-pager-view';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import SideBar, { SIDEBAR_WIDTH } from "@/components/sidebar/Sidebar";
import Translate from "@/components/home/Translate";
import { useSidebarIsOpenNotifier, useTransformationOperationStore } from "@/stores";
import Header from "../header/Header";
import TranslateButton from "../header/TranslateButton";
import SidebarIcon from "../../assets/icons/sidebar.svg";
import TextToTranslateInput from "../home/TextToTranslateInput";
import usePagerPos from "@/stores/pagerPosStore";
import SourceLangugeSelectorBottomSheet from "../home/SourceLanguageSelectorBottomSheet";
import TargetLanguageSelectorBottomSheet from "../home/TargetLanguageSelectorBottomSheet";

export default function Home() {
    const pagerRef = useRef<PagerView>(null);
    const sideBarTranslationX = useSharedValue(0);
    const isAnimating = useSharedValue(false);
    const gestureStartX = useSharedValue(0);

    const pos = useRef<number>(0);

    const [isSideBarPosAtStart, setIsSideBarPosAtStart] = useState(true);
    const pagerNativeGesture = useMemo(() => Gesture.Native(), []);

    const isSidebarOpenOrClosed = useSidebarIsOpenNotifier(state => state.isSidebarOpenOrClosed);
    const setOffset = usePagerPos(state => state.setOffset);
    const setPos = usePagerPos(state => state.setPos);

    const operation = useTransformationOperationStore((state) => state.operation);
    const operationText = operation.charAt(0).toUpperCase() + operation.slice(1);

    const setSidebarStateJS = useCallback(
        (isOpen: boolean) => {
            setIsSideBarPosAtStart(!isOpen);
            isSidebarOpenOrClosed(isOpen);
        },
        [isSidebarOpenOrClosed]
    );

    const animateToTarget = useCallback((target: number) => {
        'worklet';
        if (sideBarTranslationX.value === target) return

        isAnimating.value = true;
        sideBarTranslationX.value = withTiming(
            target,
            { duration: 500, easing: Easing.bezier(0.23, 1, 0.32, 1) },
            (isFinished) => {
                if (!isFinished) return
                isAnimating.value = false;

                const isOpen = target === SIDEBAR_WIDTH
                runOnJS(setSidebarStateJS)(isOpen)
            }
        );
    }, []);

    const openSidebar = useCallback(() => {
        if (isAnimating.value) return;
        isAnimating.value = true;
        Keyboard.dismiss();
        animateToTarget(SIDEBAR_WIDTH)
    }, [animateToTarget]);

    const panGesture = useMemo(() => {

        return Gesture.Pan()
            .simultaneousWithExternalGesture(pagerNativeGesture)
            .requireExternalGestureToFail(pagerNativeGesture)
            .onBegin(() => {
                gestureStartX.value = sideBarTranslationX.value;
            })
            .onUpdate((event) => {
                if (isAnimating.value) return;

                const proposedPosition = gestureStartX.value + event.translationX;

                const clamped = Math.max(0, Math.min(SIDEBAR_WIDTH, proposedPosition))

                sideBarTranslationX.value = clamped;
            })
            .onEnd((event) => {
                if (isAnimating.value) return;

                const currentX = sideBarTranslationX.value;
                const flingVelocity = 400;

                let shouldOpen = currentX > SIDEBAR_WIDTH / 2;

                if (event.velocityX > flingVelocity) {
                    shouldOpen = true;
                } else if (event.velocityX < -flingVelocity) {
                    shouldOpen = false;
                }

                animateToTarget(shouldOpen ? SIDEBAR_WIDTH : 0);
            });
    }, [gestureStartX, isAnimating, pagerNativeGesture, sideBarTranslationX]);

    const overlayTapGesture = useMemo(() => {
        return Gesture.Tap()
            .maxDuration(2000)
            .shouldCancelWhenOutside(false)
            .onEnd((_event, successful) => {
                if (!successful) return;
                animateToTarget(0);
            });
    }, [animateToTarget]);

    useEffect(() => {
        const unsubscribe = usePagerPos.subscribe(
            ({ newPos }, { newPos: prevNewPos }) => {
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
                <GestureDetector gesture={panGesture}>
                    <View style={{ flex: 1 }}>
                        <SideBar translationX={sideBarTranslationX} />

                        <Animated.View style={[styles.mainContent, mainContentAnimatedStyle]}>
                            <Header
                                title={"S A P O"}
                                leftComponent={(
                                    <TouchableWithoutFeedback onPress={openSidebar}>
                                        <View style={{ padding: 6 }}>
                                            <SidebarIcon width={40} height={32} stroke="black" />
                                        </View>
                                    </TouchableWithoutFeedback>
                                )}
                                rightComponent={<TranslateButton />}
                            />
                            <View style={{ backgroundColor: 'transparent', paddingHorizontal: 24, paddingTop: 0, paddingBottom: 3 }}>
                                <Text style={styles.operationText}>{operationText + " " + (operation === 'translate' ? ':)' : '(:')}</Text>
                            </View>
                            <GestureDetector gesture={pagerNativeGesture}>
                                <PagerView
                                    ref={pagerRef}
                                    style={styles.pagerView}
                                    initialPage={0}
                                    onPageScrollStateChanged={(e) => {
                                        if (e.nativeEvent.pageScrollState === 'idle') {
                                            if (usePagerPos.getState().pos !== pos.current) {
                                                setPos(pos.current)
                                            }
                                        }
                                    }}
                                    scrollEnabled={true}
                                    overScrollMode="never"
                                    keyboardDismissMode="on-drag"
                                    orientation="horizontal"
                                    onPageScroll={
                                        (e) => setOffset(e.nativeEvent.offset)
                                    }
                                    onPageSelected={
                                        (e) => {
                                            pos.current = e.nativeEvent.position
                                        }
                                    }
                                >
                                    <View key="1" style={{ width: "100%", height: "100%" }}>
                                        <TextToTranslateInput />
                                    </View>
                                    <View key="2" style={{ width: "100%", height: "100%" }}>
                                        <Translate />
                                    </View>
                                </PagerView>
                            </GestureDetector>
                            {!isSideBarPosAtStart && (
                                <GestureDetector gesture={overlayTapGesture}>
                                    <Animated.View style={styles.mainContentOverlay} />
                                </GestureDetector>
                            )}
                        </Animated.View>
                    </View>
                </GestureDetector>
                <TargetLanguageSelectorBottomSheet />
                <SourceLangugeSelectorBottomSheet />
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
    operationText: {
        fontSize: 13,
        lineHeight: 13,
        color: "#aaa",
        fontWeight: "500",
    }
});
