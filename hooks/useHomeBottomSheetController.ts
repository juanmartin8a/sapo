import BottomSheet from "@gorhom/bottom-sheet";
import { useCallback, useEffect, useRef } from "react";

import useHomeBottomSheetStore from "@/stores/homeBottomSheetStore";
import useSidebarStore from "@/stores/sidebarStore";
import type { HomeBottomSheetKey } from "@/types/bottomSheets";

export default function useHomeBottomSheetController(sheetKey: HomeBottomSheetKey) {
    const sheetRef = useRef<BottomSheet>(null);
    const isClosed = useRef(true);
    const didReachInitialSnap = useRef(false);
    const sidebarIsOpen = useSidebarStore((state) => state.isOpen);

    useEffect(() => {
        return useHomeBottomSheetStore.subscribe((state) => {
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
            useHomeBottomSheetStore.getState().bottomSheetClosed(true);
            return;
        }

        didReachInitialSnap.current = false;
        const { bottomSheet, bottomSheetToOpen } = useHomeBottomSheetStore.getState();

        if (bottomSheet === sheetKey && bottomSheetToOpen !== sheetKey) {
            useHomeBottomSheetStore.getState().bottomSheetClosed();
        }
    }, [sheetKey]);

    const handleSheetChange = useCallback((index: number) => {
        if (index < 0) {
            return;
        }

        didReachInitialSnap.current = true;
        isClosed.current = false;
        const { bottomSheet, bottomSheetToOpen, loading } = useHomeBottomSheetStore.getState();

        if (
            (bottomSheet === sheetKey || bottomSheet === undefined) &&
            bottomSheetToOpen === sheetKey &&
            loading
        ) {
            useHomeBottomSheetStore.getState().bottomSheetOpened();
        }
    }, [sheetKey]);

    return { sheetRef, handleSheetClose, handleSheetChange };
}
