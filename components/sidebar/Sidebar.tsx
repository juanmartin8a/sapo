import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Dimensions, Text, View, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import ChevronRightIcon from "../../assets/icons/chevron-right.svg";
import useLanguageSelectorBottomSheetNotifier from '@/stores/languageSelectionNotifierStore';
import { languages, languagesPlusAutoDetect } from '@/constants/languages';
import useTranslModeStore from '@/stores/translModeStore';
import { useUser } from '@clerk/clerk-expo';
import useHomeBottomSheetNotifier from '@/stores/homeBottomSheetNotifierStore';
import { HomeBottomSheetKey } from '@/types/bottomSheets';
import { useRouter } from 'expo-router';
import LogInIcon from '@/assets/icons/log-in.svg';

export const SIDEBAR_WIDTH = Dimensions.get("window").width * 0.7;

type SideBarProps = {
    translationX: Animated.SharedValue<number>
}

const SideBar = ({ translationX }: SideBarProps) => {
    const insets = useSafeAreaInsets();
    const [inputLanguage, setInputLanguage] = useState<string>(languagesPlusAutoDetect[0]);
    const [targetLanguage, setTargetLanguage] = useState<string>(languages[1]);
    const { user } = useUser();
    const router = useRouter();
    const emailAddress = user?.primaryEmailAddress?.emailAddress
        ?? user?.emailAddresses?.[0]?.emailAddress
        ?? "";
    const emailInitial = emailAddress ? emailAddress.charAt(0).toUpperCase() : "?";
    const mode = useTranslModeStore((state) => state.mode);
    const setMode = useTranslModeStore((state) => state.setMode);
    const isSignedIn = Boolean(user);

    // Get individual values from the store to avoid unnecessary re-renders
    const selectedIndex0 = useLanguageSelectorBottomSheetNotifier(state => state.selectedIndex0);
    const selectedIndex1 = useLanguageSelectorBottomSheetNotifier(state => state.selectedIndex1);

    const requestBottomSheet = useCallback((sheet: HomeBottomSheetKey) => {
        const { bottomSheet, loading } = useHomeBottomSheetNotifier.getState();

        if (loading && bottomSheet !== sheet) {
            return;
        }

        if (bottomSheet === sheet) {
            return;
        }

        useHomeBottomSheetNotifier.getState().showBottomSheet(sheet, true);
    }, []);

    const handleSignInPress = useCallback(() => {
        router.push('/auth');
    }, [router]);

    // Update the displayed languages when indices change in the store
    useEffect(() => {
        const newInputLang = languagesPlusAutoDetect[selectedIndex0] || languagesPlusAutoDetect[0];
        setInputLanguage(newInputLang);
    }, [selectedIndex0]);

    useEffect(() => {
        const newTargetLang = languages[selectedIndex1] || languages[1];
        setTargetLanguage(newTargetLang);
    }, [selectedIndex1]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateX: translationX.value - SIDEBAR_WIDTH }],
        };
    });

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
                <View style={styles.modeSection}>
                    <View style={styles.modeToggleContainer}>
                        <TouchableOpacity
                            onPress={() => setMode('translate')}
                            activeOpacity={0.7}
                            style={[
                                styles.modeOption,
                                mode === 'translate' && styles.modeOptionActive,
                            ]}
                        >
                            <Text
                                style={[
                                    styles.modeOptionText,
                                    mode === 'translate' && styles.modeOptionTextActive,
                                ]}
                            >
                                Translate
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setMode('transliterate')}
                            activeOpacity={0.7}
                            style={[
                                styles.modeOption,
                                mode === 'transliterate' && styles.modeOptionActive,
                            ]}
                        >
                            <Text
                                style={[
                                    styles.modeOptionText,
                                    mode === 'transliterate' && styles.modeOptionTextActive,
                                ]}
                            >
                                Transliterate
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
                <View style={styles.inputContainer}>
                    <Text style={styles.label}>Source Language:</Text>
                    <TouchableOpacity
                        onPress={() => requestBottomSheet('input_lang_selector')}
                        activeOpacity={0.7}
                    >
                        <View style={styles.field}>
                            <Text style={styles.textInField}>{inputLanguage}</Text>
                            <ChevronRightIcon stroke="black" />
                        </View>
                    </TouchableOpacity>
                </View>
                <View style={styles.inputContainer}>
                    <Text style={styles.label}>Target Language:</Text>
                    <TouchableOpacity
                        onPress={() => requestBottomSheet('target_lang_selector')}
                        activeOpacity={0.7}
                    >
                        <View style={styles.field}>
                            <Text style={styles.textInField}>{targetLanguage}</Text>
                            <ChevronRightIcon height={24} stroke="black" />
                        </View>
                    </TouchableOpacity>
                </View>
            </View>
            <View style={styles.footer}>
                {isSignedIn ? (
                    <View style={styles.userActionsContainer}>
                        <TouchableOpacity
                            onPress={() => requestBottomSheet('account_tap')}
                            activeOpacity={0.7}
                            style={styles.userContainer}
                        >
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>{emailInitial}</Text>
                            </View>
                            <View style={styles.userTextContainer}>
                                <Text style={styles.emailText} numberOfLines={1}>
                                    {emailAddress}
                                </Text>
                                <Text style={styles.planText}>Free</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity
                        onPress={handleSignInPress}
                        activeOpacity={0.7}
                        style={styles.signInButton}
                    >
                        <View style={styles.signInButtonContent}>
                            <LogInIcon width={20} height={20} stroke="#000" style={styles.signInButtonIcon} />
                            <Text style={styles.signInButtonText}>Sign in</Text>
                        </View>
                    </TouchableOpacity>
                )}
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    topContent: {
        flexGrow: 1,
    },
    inputContainer: {
        paddingVertical: 12
    },
    label: {
        fontSize: 16,
        fontWeight: "500",
        color: "#aaa"
    },
    field: {
        width: "100%",
        height: 42,
        alignContent: 'space-around',
        justifyContent: 'center',
        alignItems: "center",
        flexDirection: "row",
    },
    textInField: {
        flex: 1,
        fontSize: 18,
        lineHeight: 18,
        color: "black",
        fontWeight: "500",
    },
    modeSection: {
        width: '100%',
        alignItems: 'stretch',
        marginBottom: 32,
        marginTop: 8,
        // backgroundColor: 'red'
    },
    modeLabelText: {
        fontSize: 16,
        fontWeight: '500',
        color: '#aaa',
        marginBottom: 10,
        textAlign: 'left',
    },
    modeToggleContainer: {
        width: '100%',
        gap: 8,
    },
    modeOption: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: 'transparent',
        borderRadius: 12,
    },
    modeOptionActive: {
        backgroundColor: '#000',
    },
    modeOptionText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#000',
    },
    modeOptionTextActive: {
        color: '#fff',
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
    footer: {
        borderTopWidth: 1,
        borderTopColor: '#eee',
        paddingTop: 16,
    },
    userActionsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    userContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    moreButton: {
        padding: 8,
        marginLeft: 12,
        borderRadius: 999,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#000',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 16,
    },
    userTextContainer: {
        flex: 1,
    },
    emailText: {
        color: '#000',
        fontWeight: '600',
        fontSize: 14,
    },
    planText: {
        color: '#888',
        fontSize: 12,
        marginTop: 4,
    },
    signInButton: {
        width: '100%',
        borderRadius: 12,
        backgroundColor: '#f2f2f2',
        alignItems: 'flex-start',
        flexDirection: 'row'
    },
    signInButtonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 12
    },
    signInButtonIcon: {
        marginRight: 12,
    },
    signInButtonText: {
        color: '#000',
        fontWeight: '500',
        fontSize: 15,
    },
    signInHint: {
        color: '#555',
        fontSize: 13,
    },
});

export default SideBar;
