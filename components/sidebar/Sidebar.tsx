import React, {useState, useEffect} from 'react';
import { StyleSheet, Animated, Dimensions, Text, View, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChevronRightIcon from "../../assets/icons/chevron-right.svg";
import useLanguageSelectorBottomSheetNotifier from '@/stores/languageSelectorBottomSheetNotifierStore';
import { languages, languagesPlusAutoDetect } from '@/constants/languages';

export const SIDEBAR_WIDTH = Dimensions.get("window").width * 0.7;

type SideBarProps = {
    translationX: Animated.Value 
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

    return (
        <Animated.View
            style={[
                styles.sideBar,
                {
                    transform: [{ translateX: Animated.add(-SIDEBAR_WIDTH, translationX) }],
                    paddingTop: insets.top
                },
            ]}
        >
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Input Language:</Text>
              <TouchableOpacity 
                onPress={() => showBottomSheet(true)}
                activeOpacity={0.35}
              >
                <View style={styles.field}>
                    <Text style={styles.textInField}>{inputLanguage}</Text>
                    <ChevronRightIcon stroke="#aaa"/>
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
                    <ChevronRightIcon height={24} stroke="#aaa"/>
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
    },
    field: {
        width: "100%",
        height: 42,
        alignContent: 'space-around',
        justifyContent: 'center',
        alignItems: "center",
        flexDirection: "row",
        fontWeight: "bold",
    },
    textInField: {
        flex: 1,
        fontSize: 18,
        lineHeight: 18,
        color: "#aaa",
        fontWeight: "500",
    },
    sideBar: {
        position: "absolute",
        height: "100%",
        width: SIDEBAR_WIDTH,
        backgroundColor: "#f8f8f8",
        zIndex: 1,
        padding: 20,
        transform: [
            { translateX: -SIDEBAR_WIDTH }
        ]
    },
});

export default SideBar;
