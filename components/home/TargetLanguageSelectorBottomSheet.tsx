import { languages } from "@/constants/languages";
import useLanguageSelectorBottomSheetNotifier from '@/stores/languageSelectionNotifierStore';
import useSidebarIsOpenNotifier from '@/stores/sidebarIsOpenNotifierStore';
import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, TouchableOpacity } from "react-native";
import { View } from "react-native";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CheckIcon from "@/assets/icons/check.svg";
import useHomeBottomSheetNotifier from "@/stores/homeBottomSheetNotifierStore";

// Separated Component from SourceLanguageSelectorBottomSheet.tsx for simplicity
// Single component would require more logic which would make the code harder to understand and debug.

export default function TargetLanguageSelectorBottomSheet() {
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<BottomSheet>(null);
    const isClosed = useRef<boolean>(true);

    const initSnapSuccess = useRef<boolean>(false); // helps track a possible cancel before the bottom sheet opens at at least snap index 0

    const selectLanguage = useLanguageSelectorBottomSheetNotifier(state => state.selectLanguage);
    const selectedIndex1 = useLanguageSelectorBottomSheetNotifier(state => state.selectedIndex1);
    const sidebarIsOpen = useSidebarIsOpenNotifier(state => state.isOpen);

    useEffect(() => {
        const unsub = useHomeBottomSheetNotifier.subscribe((state) => {
            if (
                (state.bottomSheet === 'target_lang_selector' || state.bottomSheet === undefined) &&
                state.bottomSheetToOpen === 'target_lang_selector' &&
                state.loading === true
            ) {
                sheetRef.current?.snapToIndex(0);
            } else if (
                state.bottomSheet === 'target_lang_selector' &&
                state.bottomSheetToOpen !== 'target_lang_selector' &&
                state.loading === true
            ) {
                sheetRef.current?.close();
            }
        })

        return () => unsub();
    }, []);

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
            bottomSheet === 'target_lang_selector' &&
            bottomSheetToOpen !== 'target_lang_selector'
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
                (bottomSheet === 'target_lang_selector' || bottomSheet === undefined) &&
                bottomSheetToOpen === 'target_lang_selector' &&
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
            false, // without auto detect (false)
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
                data={Object.entries(languages)}
                keyExtractor={([key]) => key}
                ItemSeparatorComponent={() => <View style={{ height: 12 }}></View>}
                renderItem={({ item: [key, value] }) => {
                    const index = parseInt(key);
                    const isSelected = index === selectedIndex1;

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

