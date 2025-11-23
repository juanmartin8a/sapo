import { languagesPlusAutoDetect } from "@/constants/languages";
import useLanguageSelectorBottomSheetNotifier from '@/stores/languageSelectionNotifierStore';
import useSidebarIsOpenNotifier from '@/stores/sidebarIsOpenNotifierStore';
import BottomSheet from "@gorhom/bottom-sheet";
import { useCallback, useEffect, useRef } from "react";
import useHomeBottomSheetNotifier from "@/stores/homeBottomSheetNotifierStore";
import LangugeSelectorBottomSheetUI from "./LanguageSelectorBottomSheetUI";

// Separated Component from TargetLanguageSelectorBottomSheet.tsx for simplicity
// Single component would require more logic which would make the code harder to understand and debug.

export default function SourceLangugeSelectorBottomSheet() {
    const sheetRef = useRef<BottomSheet>(null);
    const isClosed = useRef<boolean>(true);

    const initSnapSuccess = useRef<boolean>(false); // helps track a possible cancel before the bottom sheet opens at at least snap index 0

    const selectLanguage = useLanguageSelectorBottomSheetNotifier(state => state.selectLanguage);
    const selectedIndex = useLanguageSelectorBottomSheetNotifier(state => state.selectedIndex0);
    const sidebarIsOpen = useSidebarIsOpenNotifier(state => state.isOpen);

    useEffect(() => {
        const unsub = useHomeBottomSheetNotifier.subscribe((state) => {
            if (
                (state.bottomSheet === 'input_lang_selector' || state.bottomSheet === undefined) &&
                state.bottomSheetToOpen === 'input_lang_selector' &&
                state.loading === true
            ) {
                sheetRef.current?.snapToIndex(0);
            } else if (
                state.bottomSheet === 'input_lang_selector' &&
                state.bottomSheetToOpen !== 'input_lang_selector' &&
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
            bottomSheet === 'input_lang_selector' &&
            bottomSheetToOpen !== 'input_lang_selector'
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
                (bottomSheet === 'input_lang_selector' || bottomSheet === undefined) &&
                bottomSheetToOpen === 'input_lang_selector' &&
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
            true, // with auto detect (true) 
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
            data={Object.entries(languagesPlusAutoDetect)}
        />
    );
}
