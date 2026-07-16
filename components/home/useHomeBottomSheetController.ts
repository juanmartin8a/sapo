import BottomSheet from "@gorhom/bottom-sheet";
import { useCallback, useEffect, useRef } from "react";

import useHomeBottomSheetNotifier from "@/stores/homeBottomSheetNotifierStore";
import useSidebarIsOpenNotifier from "@/stores/sidebarIsOpenNotifierStore";
import type { HomeBottomSheetKey } from "@/types/bottomSheets";

export default function useHomeBottomSheetController(sheetKey: HomeBottomSheetKey) {
    const sheetRef = useRef<BottomSheet>(null);
    const isClosed = useRef(true);
    const didReachInitialSnap = useRef(false);
    const sidebarIsOpen = useSidebarIsOpenNotifier((state) => state.isOpen);

    useEffect(() => {
        return useHomeBottomSheetNotifier.subscribe((state) => {
            if (
                (state.bottomSheet === sheetKey || state.bottomSheet === undefined) &&
                state.bottomSheetToOpen === sheetKey &&
                state.loading
            ) {
                sheetRef.current?.snapToIndex(0);
            } else if (
                state.bottomSheet === sheetKey &&
                state.bottomSheetToOpen !== sheetKey &&
                state.loading
            ) {
                sheetRef.current?.close();
            }
        });
    }, [sheetKey]);

    useEffect(() => {
        if (!sidebarIsOpen && !isClosed.current) {
            sheetRef.current?.close();
        }
    }, [sidebarIsOpen]);

    const handleSheetClose = useCallback(() => {
        isClosed.current = true;

        if (!didReachInitialSnap.current) {
            useHomeBottomSheetNotifier.getState().bottomSheetClosed(true);
            return;
        }

        didReachInitialSnap.current = false;
        const { bottomSheet, bottomSheetToOpen } = useHomeBottomSheetNotifier.getState();

        if (bottomSheet === sheetKey && bottomSheetToOpen !== sheetKey) {
            useHomeBottomSheetNotifier.getState().bottomSheetClosed();
        }
    }, [sheetKey]);

    const handleSheetChange = useCallback((index: number) => {
        if (index < 0) {
            return;
        }

        didReachInitialSnap.current = true;
        isClosed.current = false;
        const { bottomSheet, bottomSheetToOpen, loading } = useHomeBottomSheetNotifier.getState();

        if (
            (bottomSheet === sheetKey || bottomSheet === undefined) &&
            bottomSheetToOpen === sheetKey &&
            loading
        ) {
            useHomeBottomSheetNotifier.getState().bottomSheetOpened();
        }
    }, [sheetKey]);

    return { sheetRef, handleSheetClose, handleSheetChange };
}
