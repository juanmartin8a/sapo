// Bottom-sheet Flow for Home Bottom-sheets (written by me)

// When a bottom sheet is in screen and a new bottom sheet is triggered to open then the current bottom sheet has to close
// This can be known by the bottom sheet that needs to close if `loading` is equal to true, the value of `bottomSheetToOpen` is not equal to the bottom sheet key that represents the component, and `bottomSheet` is equal to the bottom sheet key that represents the component
// If the above is true then the component (bottom sheet) will close and trigger the `onClose` event which will convert the value of `bottomSheet` to the value of `bottomSheetToOpen`
// At this point `bottomSheet` = `bottomSheetToOpen`, `bottomSheetToOpen` = `bottomSheetToOpen`, and `loading` = true
// `loading` cannot be set to false until the requested bottom sheet is fully open at at least snap index 0
// The bottom sheet component checks that both `bottomSheetToOpen` and `bottomSheet` are equal to the bottom sheet key representing the component
// and `bottomSheet` is checked for that too except that it can also be undefined in cases where there was no bottom sheet
// When that is true then the bottom sheet uses `.snapToIndex(0)`
// The process is now complete but there is just one step missing
// When the bottom sheet reaches at least index 0 then
// the `bottomSheetOpened()` function from this store is triggered and `bottomSheetToOpen` is set to undefined, `loading` to false, and `bottomSheet` remains being the currently opened bottom sheet

// When a bottom sheet is openening and a user grabs the bottom sheet before it fully opens, `loading` stays true because it never got to a snap index of at least 0
// In this case loading remains true, then no bottom sheet will be able to slide up again
// To prevent this issue, each bottom sheet component that represents a key from `HomeBottomSheetKey`
// has a `initSnapSuccess` boolean variable that starts of as false and flips to true when the bottom sheet reaches its first snap position (index 0)
// The variable later returns to false again on a `onClose` event
// When the bottom sheet is closed and `"initSnapSuccess" === false` then it most probably means that the bottom sheet was cancelled before it opened
// so `true` is passed as a parameter to the `bottomSheetClosed` function in this store to reset the values of the variables in this store.

// If the bottom sheet is opened when there was no bottom sheet previously in the screen
// Then `bottomSheetClosed()`, the one responsible for setting `bottomSheet` = `bottomSheetToOpen`, is never called and `bottomSheetOpened()` is called directly when the bottom sheet fully expands to at least snap index 0
// In this exclusive case, then `bottomSheet` has a value of undefined, therefore we can add a conditional that checks for `bottomSheet` being equal to undefined to give it the value of `bottomSheetToOpen`
// And then making the same changes as before `bottomSheetToOpen` = undefined and `loading` = false


// Home bottom-sheet flow overview (written by codex):
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

interface HomeBottomSheetNotifierProps {
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

const useHomeBottomSheetNotifier = create<HomeBottomSheetNotifierProps>((set, get) => ({
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

export default useHomeBottomSheetNotifier;
