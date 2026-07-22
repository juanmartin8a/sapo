/* eslint-disable react-hooks/immutability -- Reanimated shared values are intentionally mutated in worklets. */
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { StyleSheet, View, Keyboard, Text, TouchableWithoutFeedback, StatusBar } from "react-native";
import { GestureHandlerRootView, GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
    cancelAnimation,
    useSharedValue,
    useAnimatedStyle,
    useAnimatedReaction,
    withTiming,
    withSpring,
    Easing,
} from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import SideBar, { SIDEBAR_WIDTH } from "@/components/sidebar/Sidebar";
import Translate from "@/components/home/Translate";
import useSidebarStore from "@/stores/sidebarStore";
import useTransformationOperationStore from "@/stores/transformationOperationStore";
import Header from "@/components/ui/Header";
import TranslateButton from "@/components/home/TranslateButton";
import SidebarIcon from "@/assets/icons/sidebar.svg";
import TextToTranslateInput from "@/components/home/TextToTranslateInput";
import usePagerStore from "@/stores/pagerStore";
import useLocalModelStore from "@/stores/localModelStore";
import SourceLanguageSelectorBottomSheet from "@/components/home/SourceLanguageSelectorBottomSheet";
import TargetLanguageSelectorBottomSheet from "@/components/home/TargetLanguageSelectorBottomSheet";
import LocalModelSelectorBottomSheet from "@/components/home/LocalModelSelectorBottomSheet";
import { triggerLightImpactHaptic } from "@/lib/haptics";
import HomePager, { type HomePagerHandle } from "@/components/home/HomePager";

export default function HomeScreen() {
    const pagerRef = useRef<HomePagerHandle>(null);
    const sideBarTranslationX = useSharedValue(0);
    const isAnimating = useSharedValue(false);
    const animationTargetX = useSharedValue(0);
    const overlayCloseTapLocked = useSharedValue(false);
    const gestureStartX = useSharedValue(0);
    const gestureStartIsOpen = useSharedValue(false);
    const gestureAnimationTargetX = useSharedValue(0);
    const gesturePreviousTranslationX = useSharedValue(0);
    const hasCapturedSidebarGesture = useSharedValue(false);

    const pos = useRef<number>(0);
    const sidebarPressCompletedRef = useRef(false);

    const [isSidebarOverlayMounted, setIsSidebarOverlayMounted] = useState(false);
    const pagerNativeGesture = useMemo(() => Gesture.Native(), []);

    const isSidebarOpenOrClosed = useSidebarStore(state => state.isSidebarOpenOrClosed);
    const setOffset = usePagerStore(state => state.setOffset);
    const setPos = usePagerStore(state => state.setPos);

    const operation = useTransformationOperationStore((state) => state.operation);
    const isLocalModelEnabled = useLocalModelStore((state) => state.isEnabled);
    const operationText = operation.charAt(0).toUpperCase() + operation.slice(1);
    const operationLabel = operation === 'translate' && isLocalModelEnabled
        ? `${operationText} | local :)`
        : operationText + " " + (operation === 'translate' ? ':)' : '(:');

    const setSidebarStateJS = useCallback(
        (isOpen: boolean) => {
            isSidebarOpenOrClosed(isOpen);
        },
        [isSidebarOpenOrClosed]
    );

    const setSidebarOverlayMountedJS = useCallback((isMounted: boolean) => {
        setIsSidebarOverlayMounted(isMounted);
    }, []);

    const triggerSidebarHapticJS = useCallback(() => {
        triggerLightImpactHaptic();
    }, []);

    useAnimatedReaction(
        () => sideBarTranslationX.value > 0,
        (isOnScreen, wasOnScreen) => {
            if (wasOnScreen === null || isOnScreen === wasOnScreen) return;

            runOnJS(setSidebarOverlayMountedJS)(isOnScreen);
        }
    );

    const animateToTarget = useCallback((target: number, releaseVelocityX?: number) => {
        'worklet';
        if (sideBarTranslationX.value === target) {
            overlayCloseTapLocked.value = false;
            return
        }

        isAnimating.value = true;
        animationTargetX.value = target;

        const onAnimationFinished = (isFinished?: boolean) => {
            if (!isFinished) return
            isAnimating.value = false;

            const isOpen = target === SIDEBAR_WIDTH
            runOnJS(setSidebarStateJS)(isOpen)
            overlayCloseTapLocked.value = false;
        };

        if (releaseVelocityX === undefined) {
            sideBarTranslationX.value = withTiming(
                target,
                { duration: 300, easing: Easing.bezier(0.4, 0, 0.2, 1) },
                onAnimationFinished
            );
            return;
        }

        sideBarTranslationX.value = withSpring(
            target,
            {
                damping: 34,
                mass: 1,
                overshootClamping: true,
                stiffness: 300,
                velocity: releaseVelocityX,
            },
            onAnimationFinished
        );
    }, [animationTargetX, isAnimating, overlayCloseTapLocked, setSidebarStateJS, sideBarTranslationX]);

    const openSidebar = useCallback(() => {
        if (isAnimating.value) return;
        sidebarPressCompletedRef.current = true;
        triggerSidebarHapticJS();
        Keyboard.dismiss();
        animateToTarget(SIDEBAR_WIDTH)
    }, [animateToTarget, isAnimating, triggerSidebarHapticJS]);

    const handleSidebarPressIn = useCallback(() => {
        sidebarPressCompletedRef.current = false;
        setSidebarOverlayMountedJS(true);
    }, [setSidebarOverlayMountedJS]);

    const handleSidebarPressOut = useCallback(() => {
        requestAnimationFrame(() => {
            if (sidebarPressCompletedRef.current || isAnimating.value || sideBarTranslationX.value > 0) return;

            setSidebarOverlayMountedJS(false);
        });
    }, [isAnimating, setSidebarOverlayMountedJS, sideBarTranslationX]);

    const panGesture = useMemo(() => {

        return Gesture.Pan()
            .simultaneousWithExternalGesture(pagerNativeGesture)
            .requireExternalGestureToFail(pagerNativeGesture)
            .onBegin(() => {
                gestureStartX.value = sideBarTranslationX.value;
                gestureStartIsOpen.value = sideBarTranslationX.value >= SIDEBAR_WIDTH / 2;
                gestureAnimationTargetX.value = animationTargetX.value;
                gesturePreviousTranslationX.value = 0;
                hasCapturedSidebarGesture.value = !isAnimating.value;
            })
            .onUpdate((event) => {
                const dragDeltaX = event.translationX - gesturePreviousTranslationX.value;
                gesturePreviousTranslationX.value = event.translationX;

                if (!hasCapturedSidebarGesture.value) {
                    const isDraggingAgainstAnimation = gestureAnimationTargetX.value === SIDEBAR_WIDTH
                        ? dragDeltaX < 0
                        : dragDeltaX > 0;

                    if (!isDraggingAgainstAnimation) return;

                    if (isAnimating.value) {
                        cancelAnimation(sideBarTranslationX);
                        isAnimating.value = false;
                    }

                    hasCapturedSidebarGesture.value = true;
                    gestureStartX.value = sideBarTranslationX.value - event.translationX;
                }

                const proposedPosition = gestureStartX.value + event.translationX;

                const clamped = Math.max(0, Math.min(SIDEBAR_WIDTH, proposedPosition))

                sideBarTranslationX.value = clamped;
            })
            .onEnd((event) => {
                if (!hasCapturedSidebarGesture.value) return;
                if (isAnimating.value) return;

                const currentX = sideBarTranslationX.value;
                const flingVelocity = 400;

                let shouldOpen = currentX > SIDEBAR_WIDTH / 2;

                if (event.velocityX > flingVelocity) {
                    shouldOpen = true;
                } else if (event.velocityX < -flingVelocity) {
                    shouldOpen = false;
                }

                const didSidebarStateChange = shouldOpen !== gestureStartIsOpen.value;

                if (didSidebarStateChange) {
                    runOnJS(triggerSidebarHapticJS)();
                }
                animateToTarget(shouldOpen ? SIDEBAR_WIDTH : 0, event.velocityX);
            })
            .onFinalize(() => {
                hasCapturedSidebarGesture.value = false;
            });
    }, [animateToTarget, animationTargetX, gestureAnimationTargetX, gesturePreviousTranslationX, gestureStartIsOpen, gestureStartX, hasCapturedSidebarGesture, isAnimating, pagerNativeGesture, sideBarTranslationX, triggerSidebarHapticJS]);

    const overlayTapGesture = useMemo(() => {
        return Gesture.Tap()
            .maxDuration(2000)
            .shouldCancelWhenOutside(false)
            .onEnd((_event, successful) => {
                if (!successful) return;
                if (overlayCloseTapLocked.value) return;

                overlayCloseTapLocked.value = true;
                runOnJS(triggerSidebarHapticJS)();
                animateToTarget(0);
            });
    }, [animateToTarget, overlayCloseTapLocked, triggerSidebarHapticJS]);

    useEffect(() => {
        const unsubscribe = usePagerStore.subscribe(
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
            <StatusBar barStyle="dark-content" />
            <GestureHandlerRootView style={{ flex: 1 }}>
                <GestureDetector gesture={panGesture}>
                    <View style={{ flex: 1 }}>
                        <SideBar translationX={sideBarTranslationX} />

                        <Animated.View style={[styles.mainContent, mainContentAnimatedStyle]}>
                            <Header
                                title={"S A P O"}
                                leftComponent={(
                                    <TouchableWithoutFeedback
                                        onPressIn={handleSidebarPressIn}
                                        onPress={openSidebar}
                                        onPressOut={handleSidebarPressOut}
                                    >
                                        <View style={{ padding: 6 }}>
                                            <SidebarIcon width={40} height={32} stroke="black" />
                                        </View>
                                    </TouchableWithoutFeedback>
                                )}
                                rightComponent={<TranslateButton />}
                            />
                            <View style={{ backgroundColor: 'transparent', paddingHorizontal: 24, paddingTop: 0, paddingBottom: 3 }}>
                                <Text style={styles.operationText}>{operationLabel}</Text>
                            </View>
                            <GestureDetector gesture={pagerNativeGesture}>
                                <HomePager
                                    ref={pagerRef}
                                    style={styles.pagerView}
                                    initialPage={0}
                                    onPageScrollStateChanged={(e) => {
                                        if (e.nativeEvent.pageScrollState === 'idle') {
                                            if (usePagerStore.getState().pos !== pos.current) {
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
                                </HomePager>
                            </GestureDetector>
                            {isSidebarOverlayMounted && (
                                <GestureDetector gesture={overlayTapGesture}>
                                    <Animated.View style={styles.mainContentOverlay} />
                                </GestureDetector>
                            )}
                        </Animated.View>
                    </View>
                </GestureDetector>
                <TargetLanguageSelectorBottomSheet />
                <SourceLanguageSelectorBottomSheet />
                <LocalModelSelectorBottomSheet />
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
