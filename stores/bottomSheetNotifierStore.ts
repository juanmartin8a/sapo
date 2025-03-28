import { create } from 'zustand';

const useBottomSheetNotifier = create((set) => ({
    show: false,
    showBottomSheet: () => {
        console.log("sapo")
        return set({show: true})
    },
    hideBottomSheet: () => {
        set({show: false})
    }
}))

export default useBottomSheetNotifier;
