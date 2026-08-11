// Home bottom-sheet flow overview:
// 1. When a sheet is already visible and a different sheet is requested, we set `loading` to true and store the key in
//    `bottomSheetToOpen`. The currently visible sheet compares its key (stored in `bottomSheet`) against `bottomSheetToOpen`.
//    If the keys differ while `loading` is true, the sheet closes itself and triggers `onClose`, which copies
//    `bottomSheetToOpen` into `bottomSheet`. At this stage both keys match, but `loading` stays true.
// 2. A sheet should call `.snapToIndex(0)` only after both `bottomSheet` and `bottomSheetToOpen` match its key. Once it reaches
//    snap index 0 it must call `bottomSheetOpened()`, which keeps `bottomSheet` as-is, clears `bottomSheetToOpen`, and turns
//    `loading` false. This marks the sheet as fully open.
// 3. If a user interrupts the opening motion before reaching index 0, `loading` would otherwise stay true forever. Each sheet
//    maintains an `initSnapSuccess` flag that flips to true the first time it reaches index 0 and resets to false on `onClose`.
//    When `onClose` fires while `initSnapSuccess` is still false, call `bottomSheetClosed(true)` so the store resets and future
//    sheets can animate in.
// 4. When the first sheet opens (no previous sheet on screen), `bottomSheetClosed()` never runs, so `bottomSheet` is still
//    undefined when `bottomSheetOpened()` is invoked. In that case we copy `bottomSheetToOpen` into `bottomSheet` before
//    clearing it and turning `loading` false, keeping the flow consistent.

import { HomeBottomSheetKey } from '@/types/bottomSheets';
import { create } from 'zustand';

interface HomeBottomSheetStoreState {
    // Key for the sheet that is currently visible (undefined when none is open)
    bottomSheet: HomeBottomSheetKey | undefined,

    // Key for the sheet that should open next
    bottomSheetToOpen: HomeBottomSheetKey | undefined,

    // True while a sheet is opening or visible; flips false once a sheet reaches snap index 0
    loading: boolean

    // Prepares a sheet to open by setting `loading` and `bottomSheetToOpen`; only one sheet can animate at a time
    showBottomSheet: (bottomSheet: HomeBottomSheetKey, loading: boolean) => void,

    // Handles an `onClose` event from the sheet (manual or automatic)
    bottomSheetClosed: (byError?: boolean) => void,

    // Automatically triggered when a sheet reaches snap index 0; finalizes the opening flow
    bottomSheetOpened: () => void,
}

const useHomeBottomSheetStore = create<HomeBottomSheetStoreState>((set, get) => ({
    bottomSheet: undefined,
    bottomSheetToOpen: undefined,
    loading: false,
    showBottomSheet: (bottomSheet: HomeBottomSheetKey, loading: boolean) => {
        return set({ bottomSheetToOpen: bottomSheet, loading: loading })
    },
    bottomSheetClosed: (byError: boolean = false) => {
        const { bottomSheetToOpen } = get();

        if (byError) {
            return set({ bottomSheet: undefined, bottomSheetToOpen: undefined, loading: false })
        }
        return set({ bottomSheet: bottomSheetToOpen })
    },
    bottomSheetOpened: () => {
        const { bottomSheet, bottomSheetToOpen } = get();

        if (bottomSheet === undefined) {
            return set({ bottomSheet: bottomSheetToOpen, bottomSheetToOpen: undefined, loading: false })
        }

        return set({ bottomSheetToOpen: undefined, loading: false })
    },
}))

export default useHomeBottomSheetStore;
