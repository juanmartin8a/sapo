import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, Dimensions, Text, View, TouchableOpacity, Alert, ActivityIndicator, Animated as RNAnimated, Easing, LayoutChangeEvent } from 'react-native';
import { useNetworkState } from 'expo-network';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import ChevronRightIcon from "../../assets/icons/chevron-right.svg";
import useLanguageSelectorBottomSheetNotifier from '@/stores/languageSelectionNotifierStore';
import { languages, languagesPlusAutoDetect } from '@/constants/languages';
import useTransformationOperationStore from '@/stores/transformationOperationStore';
import useHomeBottomSheetNotifier from '@/stores/homeBottomSheetNotifierStore';
import useLocalModelStore from '@/stores/localModelStore';
import { HomeBottomSheetKey } from '@/types/bottomSheets';
import { LOCAL_TRANSLATION_MODELS } from '@/clients/local-model';
import SideBarFooter from './SidebarFooter';
import useSubscriptionStatusStore from '@/stores/subscriptionStatusStore';
import { authClient } from '@/clients/auth-client';
import { getSessionUserAuthState } from '@/utils/auth';
import { triggerErrorHaptic, triggerLightImpactHaptic, triggerSelectionHaptic } from '@/utils/haptics';

export const SIDEBAR_WIDTH = Dimensions.get("window").width * 0.7;

type SideBarProps = {
    translationX: SharedValue<number>
}

const SideBar = ({ translationX }: SideBarProps) => {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { data: session, isPending: isAuthPending } = authClient.useSession();
    const authState = getSessionUserAuthState(session?.user);
    const isAuthenticatedUser = authState === 'authenticated';
    const hasActiveSubscription = useSubscriptionStatusStore((state) => state.hasActiveSubscription);
    const operation = useTransformationOperationStore((state) => state.operation);
    const setOperation = useTransformationOperationStore((state) => state.setOperation);
    const isLocalModelDownloaded = useLocalModelStore((state) => state.isDownloaded);
    const isLocalModelEnabled = useLocalModelStore((state) => state.isEnabled);
    const isLocalModelLoaded = useLocalModelStore((state) => state.isLoaded);
    const isLocalModelLoading = useLocalModelStore((state) => state.isLoading);
    const isLocalModelRefreshing = useLocalModelStore((state) => state.isRefreshing);
    const selectedLocalModelId = useLocalModelStore((state) => state.selectedModelId);
    const downloadedLocalModelIds = useLocalModelStore((state) => state.downloadedModelIds);
    const refreshLocalModelStatus = useLocalModelStore((state) => state.refreshDownloadedStatus);
    const loadLocalModel = useLocalModelStore((state) => state.loadModel);
    const setLocalModelEnabled = useLocalModelStore((state) => state.setEnabled);
    const toggleLocalModel = useLocalModelStore((state) => state.toggleEnabled);
    const networkState = useNetworkState();
    const selectedLocalModel = LOCAL_TRANSLATION_MODELS.find((model) => model.id === selectedLocalModelId)
        ?? null;
    const downloadedLocalModelCount = downloadedLocalModelIds.length;
    const hasSingleDownloadedLocalModel = downloadedLocalModelCount === 1;
    const hasInternetConnection = networkState.isInternetReachable ?? networkState.isConnected ?? false;
    const isLocalModeSelected = isLocalModelEnabled;
    const isLocalModelBusy = isLocalModelLoading || isLocalModelRefreshing;
    const canUseRespell = hasActiveSubscription === true;
    const shouldShowLocalModeToggle = isAuthPending || isAuthenticatedUser;
    const shouldShowLoadModelButton = isLocalModelDownloaded && !isLocalModelLoaded;
    const [isLoadModelButtonVisible, setIsLoadModelButtonVisible] = useState(shouldShowLoadModelButton);
    const [loadModelButtonLayoutHeight, setLoadModelButtonLayoutHeight] = useState(0);
    const [loadModelButtonTransitionValue] = useState(
        () => new RNAnimated.Value(shouldShowLoadModelButton ? 1 : 0)
    );
    const [loadModelButtonSpaceValue] = useState(
        () => new RNAnimated.Value(shouldShowLoadModelButton ? 1 : 0)
    );
    const loadModelButtonTransitionRunRef = useRef(0);

    // Get individual values from the store to avoid unnecessary re-renders
    const selectedIndex0 = useLanguageSelectorBottomSheetNotifier(state => state.selectedIndex0);
    const selectedIndex1 = useLanguageSelectorBottomSheetNotifier(state => state.selectedIndex1);
    const inputLanguage =
        languagesPlusAutoDetect[selectedIndex0 as keyof typeof languagesPlusAutoDetect]
        ?? languagesPlusAutoDetect[0];
    const targetLanguage =
        languages[selectedIndex1 as keyof typeof languages]
        ?? languages[1];

    const requestBottomSheet = useCallback((sheet: HomeBottomSheetKey) => {
        const { bottomSheet, loading } = useHomeBottomSheetNotifier.getState();

        if (loading && bottomSheet !== sheet) {
            return false;
        }

        if (bottomSheet === sheet) {
            return false;
        }

        useHomeBottomSheetNotifier.getState().showBottomSheet(sheet, true);
        return true;
    }, []);

    const handleToggleLocalModel = useCallback(async () => {
        await toggleLocalModel();
    }, [toggleLocalModel]);

    const handleSelectOnlineMode = useCallback(async () => {
        triggerSelectionHaptic();

        if (!isLocalModelEnabled) {
            return;
        }

        await handleToggleLocalModel();
    }, [handleToggleLocalModel, isLocalModelEnabled]);

    const handleSelectLocalMode = useCallback(async () => {
        triggerSelectionHaptic();

        if (isLocalModelEnabled) {
            return;
        }

        await handleToggleLocalModel();
    }, [handleToggleLocalModel, isLocalModelEnabled]);

    const handleLocalModelAction = useCallback(async () => {
        if (!isLocalModelDownloaded || isLocalModelLoaded || isLocalModelBusy) {
            return;
        }

        triggerLightImpactHaptic();

        try {
            await loadLocalModel();
        } catch (error) {
            if (__DEV__) {
                console.warn("Unable to load local model", error);
            }

            triggerErrorHaptic();
            Alert.alert(
                "Unable to load local model",
                "Unable to load the local model. Please try again."
            );
        }
    }, [isLocalModelDownloaded, isLocalModelLoaded, isLocalModelBusy, loadLocalModel]);

    const handleLocalModelSelectorPress = useCallback(() => {
        if (downloadedLocalModelCount === 0) {
            router.push("/settings-modal/local-models");
            return;
        }

        if (downloadedLocalModelCount > 1) {
            requestBottomSheet('local_model_selector');
        }
    }, [downloadedLocalModelCount, requestBottomSheet, router]);

    const handleManageModelsPress = useCallback(() => {
        router.push("/settings-modal/local-models");
    }, [router]);

    const handleTranslatePress = useCallback(() => {
        triggerSelectionHaptic();
        setOperation('translate');
    }, [setOperation]);

    const handleRespellPress = useCallback(() => {
        if (canUseRespell) {
            triggerSelectionHaptic();
            setOperation('respell');
            return;
        }

        triggerErrorHaptic();

        const title = isAuthenticatedUser
            ? "Subscription required"
            : "Sign in required";

        const message = isAuthenticatedUser
            ? "Respell is more expensive to run, so it cannot be included for free."
            : "Respell is available to signed-in users with an active subscription.";

        Alert.alert(
            title,
            message
        );
    }, [canUseRespell, isAuthenticatedUser, setOperation]);

    const handleInputLanguagePress = useCallback(() => {
        requestBottomSheet('input_lang_selector');
    }, [requestBottomSheet]);

    const handleTargetLanguagePress = useCallback(() => {
        requestBottomSheet('target_lang_selector');
    }, [requestBottomSheet]);

    const handleLoadModelButtonLayout = useCallback((event: LayoutChangeEvent) => {
        if (!shouldShowLoadModelButton) {
            return;
        }

        const nextHeight = Math.ceil(event.nativeEvent.layout.height);

        setLoadModelButtonLayoutHeight((currentHeight) => (
            currentHeight === nextHeight ? currentHeight : nextHeight
        ));
    }, [shouldShowLoadModelButton]);

    useEffect(() => {
        void refreshLocalModelStatus();
    }, [refreshLocalModelStatus]);

    useEffect(() => {
        if (!canUseRespell && operation === 'respell') {
            setOperation('translate');
        }
    }, [canUseRespell, operation, setOperation]);

    useEffect(() => {
        if (!shouldShowLocalModeToggle && !isLocalModelEnabled) {
            setLocalModelEnabled(true);
        }
    }, [isLocalModelEnabled, setLocalModelEnabled, shouldShowLocalModeToggle]);

    useEffect(() => {
        if (shouldShowLoadModelButton === isLoadModelButtonVisible) {
            return;
        }

        const transitionRun = loadModelButtonTransitionRunRef.current + 1;
        loadModelButtonTransitionRunRef.current = transitionRun;
        loadModelButtonTransitionValue.stopAnimation();
        loadModelButtonSpaceValue.stopAnimation();

        if (shouldShowLoadModelButton) {
            const timeout = setTimeout(() => {
                setIsLoadModelButtonVisible(true);
                loadModelButtonSpaceValue.setValue(1);
                loadModelButtonTransitionValue.setValue(0);
                RNAnimated.timing(loadModelButtonTransitionValue, {
                    toValue: 1,
                    duration: 180,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }).start();
            }, 0);

            return () => {
                clearTimeout(timeout);
            };
        }

        RNAnimated.timing(loadModelButtonTransitionValue, {
            toValue: 0,
            duration: 120,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start(({ finished }) => {
            if (!finished || loadModelButtonTransitionRunRef.current !== transitionRun) {
                return;
            }

            if (loadModelButtonLayoutHeight === 0) {
                loadModelButtonSpaceValue.setValue(0);
                setIsLoadModelButtonVisible(false);
                return;
            }

            RNAnimated.timing(loadModelButtonSpaceValue, {
                toValue: 0,
                duration: 440,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: false,
            }).start(({ finished: spaceFinished }) => {
                if (!spaceFinished || loadModelButtonTransitionRunRef.current !== transitionRun) {
                    return;
                }

                setIsLoadModelButtonVisible(false);
            });
        });
    }, [isLoadModelButtonVisible, loadModelButtonLayoutHeight, loadModelButtonSpaceValue, loadModelButtonTransitionValue, shouldShowLoadModelButton]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateX: translationX.value - SIDEBAR_WIDTH }],
        };
    });

    const loadModelButtonSpaceAnimatedStyle = loadModelButtonLayoutHeight > 0
        ? {
            height: loadModelButtonSpaceValue.interpolate({
                inputRange: [0, 1],
                outputRange: [0, loadModelButtonLayoutHeight],
            }),
            overflow: 'hidden' as const,
        }
        : null;

    const loadModelButtonAnimatedStyle = {
        opacity: loadModelButtonTransitionValue,
        transform: [
            {
                scale: loadModelButtonTransitionValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.96, 1],
                }),
            },
        ],
    };

    return (
        <Animated.View
            style={[
                styles.sideBar,
                animatedStyle,
                {
                    paddingTop: insets.top,
                    paddingBottom: insets.bottom + 16,
                },
            ]}
        >
            <View style={styles.topContent}>
                <View style={styles.operationSection}>
                    <View style={styles.operationToggleContainer}>
                        <TouchableOpacity
                            onPress={handleTranslatePress}
                            activeOpacity={0.7}
                            style={[
                                styles.operationOption,
                                operation === 'translate' && styles.operationOptionActive,
                            ]}
                        >
                            <Text
                                style={[
                                    styles.operationOptionText,
                                    operation === 'translate' && styles.operationOptionTextActive,
                                ]}
                            >
                                Translate
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={handleRespellPress}
                            activeOpacity={0.7}
                            style={[
                                styles.operationOption,
                                operation === 'respell' && styles.operationOptionActive,
                                !canUseRespell && styles.operationOptionDisabled,
                            ]}
                        >
                            <Text
                                style={[
                                    styles.operationOptionText,
                                    operation === 'respell' && styles.operationOptionTextActive,
                                    !canUseRespell && styles.operationOptionTextDisabled,
                                ]}
                            >
                                Respell
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
                <View style={styles.inputContainer}>
                    <TouchableOpacity
                        onPress={handleInputLanguagePress}
                        activeOpacity={0.7}
                    >
                        <View style={styles.field}>
                            <Text style={styles.label}>Source:</Text>
                            <View style={styles.languageValue}>
                                <Text style={styles.languageText} numberOfLines={1}>{inputLanguage}</Text>
                                <ChevronRightIcon width={22} height={22} stroke="black" />
                            </View>
                        </View>
                    </TouchableOpacity>
                </View>
                <View style={styles.inputContainer}>
                    <TouchableOpacity
                        onPress={handleTargetLanguagePress}
                        activeOpacity={0.7}
                    >
                        <View style={styles.field}>
                            <Text style={styles.label}>Target:</Text>
                            <View style={styles.languageValue}>
                                <Text style={styles.languageText} numberOfLines={1}>{targetLanguage}</Text>
                                <ChevronRightIcon width={22} height={22} stroke="black" />
                            </View>
                        </View>
                    </TouchableOpacity>
                </View>
                <View style={styles.localModelContainer}>
                    {shouldShowLocalModeToggle && (
                        <View style={styles.localModeToggleContainer}>
                            <TouchableOpacity
                                onPress={handleSelectOnlineMode}
                                activeOpacity={0.7}
                                style={[
                                    styles.localModeOption,
                                    !isLocalModeSelected && styles.localModeOptionActive,
                                ]}
                            >
                                <View style={styles.localModeOnlineLabel}>
                                    <Text
                                        style={[
                                            styles.localModeOptionText,
                                            !isLocalModeSelected && styles.localModeOptionTextActive,
                                        ]}
                                    >
                                        Online
                                    </Text>
                                    <View
                                        style={[
                                            styles.connectionDot,
                                            hasInternetConnection ? styles.connectionDotOnline : styles.connectionDotOffline,
                                        ]}
                                    />
                                </View>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleSelectLocalMode}
                                activeOpacity={0.7}
                                style={[
                                    styles.localModeOption,
                                    isLocalModeSelected && styles.localModeOptionActive,
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.localModeOptionText,
                                        isLocalModeSelected && styles.localModeOptionTextActive,
                                    ]}
                                >
                                    Local
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                        <View style={[
                            styles.localModelSelectorContainer,
                            !shouldShowLocalModeToggle && styles.localModelSelectorContainerNoToggle,
                        ]}>
                            <Text style={styles.localModelSelectorLabel}>Local model:</Text>
                            <TouchableOpacity
                                onPress={handleLocalModelSelectorPress}
                                disabled={hasSingleDownloadedLocalModel}
                                activeOpacity={0.7}
                            >
                                <View style={styles.localModelSelectorField}>
                                    <View style={styles.localModelNameContainer}>
                                        <Text style={styles.localModelSelectorText} numberOfLines={1}>
                                            {selectedLocalModel?.displayName ?? "None"}
                                        </Text>
                                        {selectedLocalModel ? (
                                            <View
                                                style={[
                                                    styles.localModelStatusDot,
                                                    isLocalModelLoading
                                                        ? styles.localModelStatusDotLoading
                                                        : isLocalModelLoaded
                                                            ? styles.localModelStatusDotLoaded
                                                            : styles.localModelStatusDotIdle,
                                                ]}
                                            />
                                        ) : null}
                                    </View>
                                    {!hasSingleDownloadedLocalModel && (
                                        <ChevronRightIcon width={22} height={22} stroke="black" />
                                    )}
                                </View>
                            </TouchableOpacity>
                        </View>
                        {isLoadModelButtonVisible && (
                            <RNAnimated.View onLayout={handleLoadModelButtonLayout} style={loadModelButtonSpaceAnimatedStyle}>
                                <RNAnimated.View style={loadModelButtonAnimatedStyle}>
                                    <TouchableOpacity
                                        onPress={handleLocalModelAction}
                                        disabled={isLocalModelBusy}
                                        activeOpacity={0.78}
                                        style={[
                                            styles.localModelActionButton,
                                            isLocalModelBusy && styles.localModelActionButtonDisabled,
                                        ]}
                                    >
                                        <View style={styles.localModelActionButtonContent}>
                                            <Text style={styles.localModelActionButtonText}>Load model</Text>
                                            {isLocalModelLoading && (
                                                <View style={styles.localModelActionSpinner} pointerEvents="none">
                                                    <ActivityIndicator color="#fff" size="small" />
                                                </View>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                </RNAnimated.View>
                            </RNAnimated.View>
                        )}
                        <TouchableOpacity
                            onPress={handleManageModelsPress}
                            activeOpacity={0.78}
                            style={[styles.localModelActionButton, styles.manageModelsButton]}
                        >
                            <View style={styles.localModelActionButtonContent}>
                                <Text style={[styles.localModelActionButtonText, styles.manageModelsButtonText]}>
                                    Manage models
                                </Text>
                            </View>
                        </TouchableOpacity>
                </View>
            </View>
            <SideBarFooter />
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    topContent: {
        flexGrow: 1,
    },
    inputContainer: {
        paddingVertical: 6,
    },
    label: {
        fontSize: 15,
        fontWeight: "500",
        color: "#aaa",
        marginRight: 12,
    },
    field: {
        width: "100%",
        minHeight: 34,
        justifyContent: 'space-between',
        alignItems: "center",
        flexDirection: "row",
    },
    languageValue: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    languageText: {
        flexShrink: 1,
        fontSize: 16,
        lineHeight: 18,
        color: "black",
        fontWeight: "500",
        textAlign: 'right',
    },
    localModelContainer: {
        paddingVertical: 12,
        marginTop: 32,
    },
    localModelSelectorContainer: {
        paddingTop: 32,
    },
    localModelSelectorContainerNoToggle: {
        paddingTop: 0,
    },
    manageModelsButton: {
        marginTop: 32,
        backgroundColor: '#f2f2f2',
    },
    manageModelsButtonText: {
        color: '#000',
    },
    localModelSelectorLabel: {
        color: "#aaa",
        fontSize: 15,
        fontWeight: "500",
        marginBottom: 2,
    },
    localModelSelectorField: {
        width: "100%",
        minHeight: 34,
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "space-between",
    },
    localModelNameContainer: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
    },
    localModelSelectorText: {
        flexShrink: 1,
        fontSize: 16,
        lineHeight: 18,
        color: "black",
        fontWeight: "500",
    },
    localModelStatusDot: {
        width: 5,
        height: 5,
        borderRadius: 3,
    },
    localModelStatusDotIdle: {
        backgroundColor: '#aaa',
    },
    localModelStatusDotLoading: {
        backgroundColor: '#FFCC00',
    },
    localModelStatusDotLoaded: {
        backgroundColor: '#34C759',
    },
    localModelActionButton: {
        width: '100%',
        minHeight: 42,
        marginTop: 10,
        borderRadius: 12,
        backgroundColor: '#000',
        alignItems: 'stretch',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    localModelActionButtonDisabled: {
        opacity: 0.45,
    },
    localModelActionButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    localModelActionButtonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        position: 'relative',
    },
    localModelActionSpinner: {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        justifyContent: 'center',
    },
    operationSection: {
        width: '100%',
        alignItems: 'stretch',
        marginBottom: 32,
        marginTop: 8,
        // backgroundColor: 'red'
    },
    operationLabelText: {
        fontSize: 16,
        fontWeight: '500',
        color: '#aaa',
        marginBottom: 10,
        textAlign: 'left',
    },
    operationToggleContainer: {
        width: '100%',
        gap: 8,
    },
    operationOption: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: 'transparent',
        borderRadius: 12,
    },
    operationOptionActive: {
        backgroundColor: '#000',
    },
    operationOptionDisabled: {
        opacity: 0.45,
    },
    operationOptionText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#000',
    },
    operationOptionTextActive: {
        color: '#fff',
    },
    operationOptionTextDisabled: {
        color: '#888',
    },
    localModeToggleContainer: {
        width: '100%',
        flexDirection: 'row',
        gap: 8,
    },
    localModeOption: {
        flex: 1,
        minHeight: 42,
        paddingVertical: 12,
        paddingHorizontal: 12,
        backgroundColor: 'transparent',
        borderRadius: 12,
        alignItems: 'flex-start',
        justifyContent: 'center',
    },
    localModeOptionActive: {
        backgroundColor: '#000',
    },
    localModeOptionDisabled: {
        opacity: 0.45,
    },
    localModeOptionText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#000',
    },
    localModeOptionTextActive: {
        color: '#fff',
    },
    localModeOnlineLabel: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 6,
    },
    connectionDot: {
        width: 5,
        height: 5,
        borderRadius: 3,
    },
    connectionDotOnline: {
        backgroundColor: '#34C759',
    },
    connectionDotOffline: {
        backgroundColor: '#FF3B30',
    },
    sideBar: {
        position: "absolute",
        height: "100%",
        width: SIDEBAR_WIDTH,
        backgroundColor: "#fff",
        borderRightWidth: 1,
        borderRightColor: 'black',
        zIndex: 1,
        padding: 20,
        justifyContent: 'space-between',
        // borderBottomRightRadius: 20,
        // borderTopRightRadius: 20,
        transform: [
            { translateX: -SIDEBAR_WIDTH }
        ]
    },
});

export default SideBar;
