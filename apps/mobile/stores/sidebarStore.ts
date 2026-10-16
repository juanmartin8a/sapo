import { create } from 'zustand';

interface SidebarStoreState {
    isOpen: boolean 

    isSidebarOpenOrClosed: (isOpen: boolean) => void
}

const useSidebarStore = create<SidebarStoreState>((set) => ({
    isOpen: false, // true if fully open
    isSidebarOpenOrClosed: (isOpen: boolean) => {
        return set({isOpen: isOpen})
    },
}))

export default useSidebarStore;
