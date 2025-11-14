import { HomeBottomSheetKey } from '@/types/bottomSheets';
import { create } from 'zustand';

interface HomeBottomSheetNotifierProps {
    // if loading then the bottom sheet is not yet fully in view
    bottomSheet: HomeBottomSheetKey | undefined,
    bottomSheetToOpen: HomeBottomSheetKey | undefined,
    loading: boolean

    showBottomSheet: (bottomSheet: HomeBottomSheetKey, loading: boolean) => void,
    bottomSheetClosed: (byError?: boolean) => void,
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
