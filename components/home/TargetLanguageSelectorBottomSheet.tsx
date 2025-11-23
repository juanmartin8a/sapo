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
import LangugeSelectorBottomSheetUI from "./LanguageSelectorBottomSheetUI";

// Separated Component from SourceLanguageSelectorBottomSheet.tsx for simplicity
// Single component would require more logic which would make the code harder to understand and debug.

export default function TargetLanguageSelectorBottomSheet() {
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<BottomSheet>(null);
    const isClosed = useRef<boolean>(true);

    const initSnapSuccess = useRef<boolean>(false); // helps track a possible cancel before the bottom sheet opens at at least snap index 0

    const selectLanguage = useLanguageSelectorBottomSheetNotifier(state => state.selectLanguage);
    const selectedIndex = useLanguageSelectorBottomSheetNotifier(state => state.selectedIndex1);
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
        <LangugeSelectorBottomSheetUI
            selectedIndex={selectedIndex}
            ref={sheetRef}
            onLanguageSelected={handleLanguageSelect}
            onClose={handleSheetClose}
            onChange={handleSheetChange}
            data={Object.entries(languages)}
        />
    );
}
