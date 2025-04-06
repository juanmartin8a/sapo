import { create } from 'zustand';

interface SideBarIsOpenStoreProps {
    isOpen: boolean 

    isSidebarOpenOrClosed: (isOpen: boolean) => void
}

const useSidebarIsOpenStore = create<SideBarIsOpenStoreProps>((set) => ({
    isOpen: false, // true if fully open
    isSidebarOpenOrClosed: (isOpen: boolean) => {
        return set({isOpen: isOpen})
    },
}))

export default useSidebarIsOpenStore;
