import { create } from 'zustand';

export type translateButtonState = "next" | "loading" | "stop"

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
