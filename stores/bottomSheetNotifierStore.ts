import { create } from 'zustand';

const useBottomSheetNotifier = create((set) => ({
    withAutoDetect: false,
    showBottomSheet: (withAutoDetect: boolean) => {
        return set({withAutoDetect: withAutoDetect})
    },
}))

export default useBottomSheetNotifier;
