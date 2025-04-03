import { create } from 'zustand';

interface useTextStoreProps {
    text: string;
  
    setText: (text: string) => void;
}

const useTextStore = create<useTextStoreProps>((set) => ({
    text: "", 
    setText: (text: string) => {
        set({text: text}) 
    },
}))

export default useTextStore
