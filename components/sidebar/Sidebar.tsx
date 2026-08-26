import { useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useNetworkState } from 'expo-network';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, LinearTransition, SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import ChevronRightIcon from "../../assets/icons/chevron-right.svg";
import useLanguageSelectionStore from '@/stores/languageSelectionStore';
import {
    DEFAULT_SOURCE_LANGUAGE_ID,
    DEFAULT_TARGET_LANGUAGE_ID,
    languages,
    languagesPlusAutoDetect,
} from '@/constants/languages';
import { HOME_BOTTOM_SHEET_KEYS } from '@/constants/bottomSheets';
import { APP_ROUTES } from '@/constants/routes';
import useTransformationOperationStore from '@/stores/transformationOperationStore';
import useHomeBottomSheetStore from '@/stores/homeBottomSheetStore';
import useLocalModelStore from '@/stores/localModelStore';
import { HomeBottomSheetKey } from '@/types/bottomSheets';
import { LOCAL_TRANSLATION_MODELS } from '@/constants/localModelCatalog';
import SidebarFooter from './SidebarFooter';
import useSubscriptionStatusStore from '@/stores/subscriptionStatusStore';
import { useAuthState } from '@/providers/AuthStateProvider';
import { triggerErrorHaptic, triggerLightImpactHaptic, triggerSelectionHaptic } from '@/lib/haptics';
import { UI_DISABLED_OPACITY } from '@/constants/ui';
import { getEffectiveSubscriptionStatus } from '@/utils/subscription';

type SidebarProps = {
    translationX: SharedValue<number>
    width: number
}

const Sidebar = ({ translationX, width }: SidebarProps) => {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { status: authStatus, userId } = useAuthState();
    const isAuthenticatedUser = authStatus === 'authenticated';
    const subscriptionUserId = useSubscriptionStatusStore((state) => state.userId);
    const hasActiveSubscription = useSubscriptionStatusStore((state) => state.hasActiveSubscription);
    const operation = useTransformationOperationStore((state) => state.operation);
    const setOperation = useTransformationOperationStore((state) => state.setOperation);
    const isLocalModelDownloaded = useLocalModelStore((state) => state.isDownloaded);
    const isLocalModelEnabled = useLocalModelStore((state) => state.isEnabled);
    const isLocalModelLoaded = useLocalModelStore((state) => state.isLoaded);
    const isLocalModelLoading = useLocalModelStore((state) => state.isLoading);
    const loadingLocalModelId = useLocalModelStore((state) => state.loadingModelId);
    const deletingLocalModelId = useLocalModelStore((state) => state.deletingModelId);
    const isLocalModelRefreshing = useLocalModelStore((state) => state.isRefreshing);
    const selectedLocalModelId = useLocalModelStore((state) => state.selectedModelId);
    const downloadedLocalModelIds = useLocalModelStore((state) => state.downloadedModelIds);
    const refreshLocalModelStatus = useLocalModelStore((state) => state.refreshDownloadedStatus);
    const loadLocalModel = useLocalModelStore((state) => state.loadModel);
    const setLocalModelEnabled = useLocalModelStore((state) => state.setEnabled);
    const networkState = useNetworkState();
    const selectedLocalModel = LOCAL_TRANSLATION_MODELS.find((model) => model.id === selectedLocalModelId)
        ?? null;
    const downloadedLocalModelCount = downloadedLocalModelIds.length;
    const hasSingleDownloadedLocalModel = downloadedLocalModelCount === 1;
    const hasInternetConnection = networkState.isInternetReachable ?? networkState.isConnected ?? false;
    const isLocalModeSelected = isLocalModelEnabled;
    const isSelectedLocalModelLoading = isLocalModelLoading &&
        loadingLocalModelId === selectedLocalModelId;
    const isLocalModelBusy = isSelectedLocalModelLoading ||
        isLocalModelRefreshing ||
        deletingLocalModelId !== null;
    const effectiveSubscriptionStatus = getEffectiveSubscriptionStatus({
        authStatus,
        userId,
        subscriptionUserId,
        hasActiveSubscription,
    });
    const canUseRespell = effectiveSubscriptionStatus === true;
    const shouldShowLocalModeToggle = isAuthenticatedUser;
    const shouldShowLoadModelButton = isLocalModelDownloaded && !isLocalModelLoaded;
    // Get individual values from the store to avoid unnecessary re-renders
    const selectedIndex0 = useLanguageSelectionStore(state => state.selectedIndex0);
    const selectedIndex1 = useLanguageSelectionStore(state => state.selectedIndex1);
    const inputLanguage =
        languagesPlusAutoDetect[selectedIndex0 as keyof typeof languagesPlusAutoDetect]
        ?? languagesPlusAutoDetect[DEFAULT_SOURCE_LANGUAGE_ID];
    const targetLanguage =
        languages[selectedIndex1 as keyof typeof languages]
        ?? languages[DEFAULT_TARGET_LANGUAGE_ID];

    const requestBottomSheet = useCallback((sheet: HomeBottomSheetKey) => {
        const { bottomSheet, loading } = useHomeBottomSheetStore.getState();

        if (loading && bottomSheet !== sheet) {
            return false;
        }

        if (bottomSheet === sheet) {
            return false;
        }

        useHomeBottomSheetStore.getState().showBottomSheet(sheet);
        return true;
    }, []);

    const handleSelectOnlineMode = useCallback(() => {
        if (!isLocalModelEnabled) {
            return;
        }

        triggerSelectionHaptic();
        setLocalModelEnabled(false);
    }, [isLocalModelEnabled, setLocalModelEnabled]);

    const handleSelectLocalMode = useCallback(() => {
        if (isLocalModelEnabled) {
            return;
        }

        triggerSelectionHaptic();
        setLocalModelEnabled(true);
    }, [isLocalModelEnabled, setLocalModelEnabled]);

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
            router.push(APP_ROUTES.LOCAL_MODELS);
            return;
        }

        if (downloadedLocalModelCount > 1) {
            requestBottomSheet(HOME_BOTTOM_SHEET_KEYS.LOCAL_MODEL);
        }
    }, [downloadedLocalModelCount, requestBottomSheet, router]);

    const handleManageModelsPress = useCallback(() => {
        router.push(APP_ROUTES.LOCAL_MODELS);
    }, [router]);

    const handleTranslatePress = useCallback(() => {
        if (operation === 'translate') {
            return;
        }

        triggerSelectionHaptic();
        setOperation('translate');
    }, [operation, setOperation]);

    const handleRespellPress = useCallback(() => {
        if (operation === 'respell') {
            return;
        }

        if (canUseRespell) {
            triggerSelectionHaptic();
            setOperation('respell');
            return;
        }

        triggerErrorHaptic();

        if (effectiveSubscriptionStatus === null) {
            Alert.alert(
                "Checking subscription",
                "Please wait a moment while SAPO confirms your subscription."
            );
            return;
        }

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
    }, [canUseRespell, effectiveSubscriptionStatus, isAuthenticatedUser, operation, setOperation]);

    const handleInputLanguagePress = useCallback(() => {
        requestBottomSheet(HOME_BOTTOM_SHEET_KEYS.INPUT_LANGUAGE);
    }, [requestBottomSheet]);

    const handleTargetLanguagePress = useCallback(() => {
        requestBottomSheet(HOME_BOTTOM_SHEET_KEYS.TARGET_LANGUAGE);
    }, [requestBottomSheet]);

    useEffect(() => {
        void refreshLocalModelStatus();
    }, [refreshLocalModelStatus]);

    useEffect(() => {
        if (effectiveSubscriptionStatus === false && operation === 'respell') {
            setOperation('translate');
        }
    }, [effectiveSubscriptionStatus, operation, setOperation]);

    useEffect(() => {
        if (authStatus === 'signed_out' && !isLocalModelEnabled) {
            setLocalModelEnabled(true);
        }
    }, [authStatus, isLocalModelEnabled, setLocalModelEnabled]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateX: translationX.value - width }],
        };
    });

    return (
        <Animated.View
            style={[
                styles.sideBar,
                animatedStyle,
                {
                    width,
                    paddingTop: insets.top,
                    paddingBottom: insets.bottom + 16,
                },
            ]}
        >
            <ScrollView
                style={styles.topContentScroll}
                contentContainerStyle={styles.topContent}
                showsVerticalScrollIndicator={false}
            >
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
                                                    isSelectedLocalModelLoading
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
                        {shouldShowLoadModelButton && (
                            <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
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
                                        {isSelectedLocalModelLoading && (
                                            <View style={styles.localModelActionSpinner} pointerEvents="none">
                                                <ActivityIndicator color="#fff" size="small" />
                                            </View>
                                        )}
                                    </View>
                                </TouchableOpacity>
                            </Animated.View>
                        )}
                        <Animated.View layout={LinearTransition.duration(220)}>
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
                        </Animated.View>
                </View>
            </ScrollView>
            <SidebarFooter />
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    topContentScroll: {
        flex: 1,
    },
    topContent: {
        flexGrow: 1,
        paddingBottom: 20,
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
        opacity: UI_DISABLED_OPACITY,
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
        opacity: UI_DISABLED_OPACITY,
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
        backgroundColor: "#fff",
        borderRightWidth: 1,
        borderRightColor: 'black',
        zIndex: 1,
        padding: 20,
        justifyContent: 'space-between',
    },
});

export default Sidebar;
