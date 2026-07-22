import { create } from 'zustand';

export type TranslateButtonState = "next" | "loading" | "stop" | "repeat"

interface TranslateButtonStoreState {
    state: TranslateButtonState;
  
    switchState: (state: TranslateButtonState) => void;
}

const useTranslateButtonStore = create<TranslateButtonStoreState>((set) => ({
    state: "next", 
    switchState: (state: TranslateButtonState) => {
        set({state: state})
    },
}))

export default useTranslateButtonStore
