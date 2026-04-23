import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Dimensions, Text, View, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import ChevronRightIcon from "../../assets/icons/chevron-right.svg";
import useLanguageSelectorBottomSheetNotifier from '@/stores/languageSelectionNotifierStore';
import { languages, languagesPlusAutoDetect } from '@/constants/languages';
import useTransformationOperationStore from '@/stores/transformationOperationStore';
import useHomeBottomSheetNotifier from '@/stores/homeBottomSheetNotifierStore';
import { HomeBottomSheetKey } from '@/types/bottomSheets';
import SideBarFooter from './SidebarFooter';

export const SIDEBAR_WIDTH = Dimensions.get("window").width * 0.7;

type SideBarProps = {
    translationX: SharedValue<number>
}

const SideBar = ({ translationX }: SideBarProps) => {
    const insets = useSafeAreaInsets();
    const [inputLanguage, setInputLanguage] = useState<string>(languagesPlusAutoDetect[0]);
    const [targetLanguage, setTargetLanguage] = useState<string>(languages[1]);
    const operation = useTransformationOperationStore((state) => state.operation);
    const setOperation = useTransformationOperationStore((state) => state.setOperation);

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

    // Update the displayed languages when indices change in the store
    useEffect(() => {
        const newInputLang =
            languagesPlusAutoDetect[selectedIndex0 as keyof typeof languagesPlusAutoDetect]
            ?? languagesPlusAutoDetect[0];
        setInputLanguage(newInputLang);
    }, [selectedIndex0]);

    useEffect(() => {
        const newTargetLang =
            languages[selectedIndex1 as keyof typeof languages]
            ?? languages[1];
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
                <View style={styles.operationSection}>
                    <View style={styles.operationToggleContainer}>
                        <TouchableOpacity
                            onPress={() => setOperation('translate')}
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
                            onPress={() => setOperation('respell')}
                            activeOpacity={0.7}
                            style={[
                                styles.operationOption,
                                operation === 'respell' && styles.operationOptionActive,
                            ]}
                        >
                            <Text
                                style={[
                                    styles.operationOptionText,
                                    operation === 'respell' && styles.operationOptionTextActive,
                                ]}
                            >
                                Respell
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
                            <ChevronRightIcon width={22} stroke="black" />
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
                            <ChevronRightIcon height={22} stroke="black" />
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
        paddingVertical: 12
    },
    label: {
        fontSize: 15,
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
        fontSize: 16,
        lineHeight: 16,
        color: "black",
        fontWeight: "500",
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
    operationOptionText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#000',
    },
    operationOptionTextActive: {
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
});

export default SideBar;
