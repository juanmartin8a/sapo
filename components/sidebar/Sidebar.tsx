import React, { useState, useEffect } from 'react';
import { StyleSheet, Dimensions, Text, View, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import ChevronRightIcon from "../../assets/icons/chevron-right.svg";
import useLanguageSelectorBottomSheetNotifier from '@/stores/languageSelectorBottomSheetNotifierStore';
import { languages, languagesPlusAutoDetect } from '@/constants/languages';

export const SIDEBAR_WIDTH = Dimensions.get("window").width * 0.7;

type SideBarProps = {
    translationX: Animated.SharedValue<number>
}

const SideBar = ({ translationX }: SideBarProps) => {
    const insets = useSafeAreaInsets();
    const [inputLanguage, setInputLanguage] = useState<string>(languagesPlusAutoDetect[0]);
    const [targetLanguage, setTargetLanguage] = useState<string>(languages[1]);

    // Get individual values from the store to avoid unnecessary re-renders
    const showBottomSheet = useLanguageSelectorBottomSheetNotifier(state => state.showBottomSheet);
    const selectedIndex0 = useLanguageSelectorBottomSheetNotifier(state => state.selectedIndex0);
    const selectedIndex1 = useLanguageSelectorBottomSheetNotifier(state => state.selectedIndex1);

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
                    paddingTop: insets.top
                },
            ]}
        >
            <View style={{
                flexDirection: 'row',
                marginBottom: 24,
                alignItems: 'center',
                paddingVertical: 12,
            }}>
                <Text style={{ fontSize: 16, fontWeight: '500', color: '#aaa' }}>Mode: </Text>
                <TouchableOpacity
                    onPress={() => showBottomSheet(true)}
                    activeOpacity={0.35}
                    style={{ flex: 1 }}
                >
                    <View style={{
                        alignContent: 'space-around',
                        alignItems: "center",
                        flexDirection: 'row',
                    }}>
                        <Text style={{ flex: 1, fontSize: 16, fontWeight: '500' }}>Transliterate</Text>
                        <ChevronRightIcon stroke="black" />
                    </View>
                </TouchableOpacity>
            </View>
            <View style={styles.inputContainer}>
                <Text style={styles.label}>Input Language:</Text>
                <TouchableOpacity
                    onPress={() => showBottomSheet(true)}
                    activeOpacity={0.35}
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
                    onPress={() => showBottomSheet(false)}
                    activeOpacity={0.35}
                >
                    <View style={styles.field}>
                        <Text style={styles.textInField}>{targetLanguage}</Text>
                        <ChevronRightIcon height={24} stroke="black" />
                    </View>
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
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
    sideBar: {
        position: "absolute",
        height: "100%",
        width: SIDEBAR_WIDTH,
        backgroundColor: "#fff",
        borderRightWidth: 1,
        borderRightColor: 'black',
        zIndex: 1,
        padding: 20,
        // borderBottomRightRadius: 20,
        // borderTopRightRadius: 20,
        transform: [
            { translateX: -SIDEBAR_WIDTH }
        ]
    },
});

export default SideBar;
