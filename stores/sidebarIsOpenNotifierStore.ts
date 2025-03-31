import { create } from 'zustand';

const useSidebarIsOpenNotifier = create((set) => ({
    isOpen: false, // true if fully open
    isSidebarOpenOrClosed: (isOpen: boolean) => {
        return set({isOpen: isOpen})
    },
}))

export default useSidebarIsOpenNotifier;
