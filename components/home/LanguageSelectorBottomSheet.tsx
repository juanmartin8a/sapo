import { languages, languagesPlusAutoDetect } from "@/constants/languages";
import useLanguageSelectorBottomSheetNotifier from '@/stores/languageSelectorBottomSheetNotifierStore';
import useSidebarIsOpenNotifier from '@/stores/sidebarIsOpenNotifierStore';
import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, TouchableOpacity } from "react-native";
import { View } from "react-native";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CheckIcon from "@/assets/icons/check.svg";
import useHomeBottomSheetNotifier from "@/stores/homeBottomSheetNotifierStore";
import { LanguageSelectorBottomSheetKey } from "@/types/bottomSheets";
import { isLanguageSelectorBottomSheetKey } from "@/utils/bottomSheets";


export default function LanguageSelectorBottomSheet() {
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<BottomSheet>(null);
    const [bottomSheetKey, setBottomSheetKey] = useState<LanguageSelectorBottomSheetKey>('input_lang_selector');
    const bottomSheetKeyRef = useRef<LanguageSelectorBottomSheetKey>('input_lang_selector'); // ref to track current state
    const withAutoDetect = bottomSheetKey === 'input_lang_selector';
    const isClosed = useRef<boolean>(true);

    const initSnapSuccess = useRef<boolean>(false); // if it never reaches true then it was probably cancelled

    const selectLanguage = useLanguageSelectorBottomSheetNotifier(state => state.selectLanguage);
    const selectedIndex0 = useLanguageSelectorBottomSheetNotifier(state => state.selectedIndex0);
    const selectedIndex1 = useLanguageSelectorBottomSheetNotifier(state => state.selectedIndex1);
    const sidebarIsOpen = useSidebarIsOpenNotifier(state => state.isOpen);

    useEffect(() => {
        const unsub = useHomeBottomSheetNotifier.subscribe((state) => {
            if (
                isClosed.current && isLanguageSelectorBottomSheetKey(state.bottomSheetToOpen)
            ) {
                bottomSheetKeyRef.current = state.bottomSheetToOpen

                if (
                    (state.bottomSheet === bottomSheetKeyRef.current || state.bottomSheet === undefined) &&
                    state.bottomSheetToOpen === bottomSheetKeyRef.current &&
                    state.loading === true
                ) {
                    setBottomSheetKey(bottomSheetKeyRef.current)
                    sheetRef.current?.snapToIndex(0);
                }
            } else {
                if (
                    state.bottomSheet === bottomSheetKeyRef.current &&
                    state.bottomSheetToOpen !== bottomSheetKeyRef.current &&
                    state.loading === true
                ) {
                    sheetRef.current?.close();
                }
            }
        })

        return () => unsub();
    }, []);

    // useEffect(() => {
    //     bottomSheetKeyRef.current = bottomSheetKey;
    // }, [bottomSheetKey]);

    // Close the bottom sheet when sidebar is closed
    useEffect(() => {
        if (!sidebarIsOpen && !isClosed.current) {
            sheetRef.current?.close();
        }
    }, [sidebarIsOpen]);

    const handleSheetClose = useCallback(() => {
        isClosed.current = true;

        if (!initSnapSuccess.current) {
            useHomeBottomSheetNotifier.getState().bottomSheetClosed(true)
            return;
        }

        initSnapSuccess.current = false;

        const { bottomSheet, bottomSheetToOpen } = useHomeBottomSheetNotifier.getState();

        if (
            bottomSheet === bottomSheetKeyRef.current &&
            bottomSheetToOpen !== bottomSheetKeyRef.current
        ) {

            useHomeBottomSheetNotifier.getState().bottomSheetClosed()
        }
    }, [])

    const handleSheetChange = useCallback((index: number) => {
        if (index > -1) {
            initSnapSuccess.current = true;

            isClosed.current = false;

            const { bottomSheet, bottomSheetToOpen, loading } = useHomeBottomSheetNotifier.getState();

            if (
                (bottomSheet === bottomSheetKeyRef.current || bottomSheet === undefined) &&
                bottomSheetToOpen === bottomSheetKeyRef.current &&
                loading === true
            ) {
                useHomeBottomSheetNotifier.getState().bottomSheetOpened()
            }

            return;
        }

    }, [])

    const handleLanguageSelect = (key: string) => {
        const index = parseInt(key);
        selectLanguage(
            withAutoDetect, // for input
            index
        );
    }

    return (
        <BottomSheet
            ref={sheetRef}
            snapPoints={["45%", "65%"]}
            index={-1}
            enableDynamicSizing={false}
            enablePanDownToClose={true}
            handleIndicatorStyle={styles.handleIndicator}
            onClose={handleSheetClose}
            onChange={handleSheetChange}
            style={styles.bottomSheet}
            backgroundStyle={styles.bottomSheetBackground}
        >
            <BottomSheetFlatList
                data={Object.entries(withAutoDetect ? languagesPlusAutoDetect : languages)}
                keyExtractor={([key]) => key}
                ItemSeparatorComponent={() => <View style={{ height: 12 }}></View>}
                renderItem={({ item: [key, value] }) => {
                    const index = parseInt(key);
                    const selectedIndex = withAutoDetect ? selectedIndex0 : selectedIndex1;
                    const isSelected = index === selectedIndex;

                    return (
                        <TouchableOpacity
                            style={styles.listItem}
                            onPress={() => handleLanguageSelect(key)}
                            activeOpacity={0.65}
                        >
                            <Text style={styles.listItemText}>{value}</Text>
                            {isSelected && <CheckIcon height={16 * 1.2} stroke="pink" />}
                        </TouchableOpacity>
                    );
                }}
                contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom, paddingTop: 12 }]}
            />

        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    contentContainer: {
        paddingHorizontal: 24,
    },
    bottomSheet: {
        shadowColor: "#aaa",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
    },
    handleIndicator: {
        backgroundColor: 'white',
        width: 25,
        height: 5,
        borderRadius: 20,
    },
    bottomSheetBackground: {
        backgroundColor: "black",
        borderTopLeftRadius: 15,
        borderTopRightRadius: 15,
    },
    listItem: {
        flex: 1,
        justifyContent: "space-between",
        alignItems: "center",
        flexDirection: 'row',
        paddingVertical: 18,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: 'white',
    },
    listItemText: {
        fontSize: 16,
        color: 'white',
    }
})

