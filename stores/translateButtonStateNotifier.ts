import { create } from 'zustand';

export type translateButtonState = "next" | "loading" | "stop"

interface TranslateButtonStateNotifierProps {
    state: translateButtonState;
  
    switchState: (state: translateButtonState) => void;
}

const useTranslateButtonStateNotifier = create<TranslateButtonStateNotifierProps>((set) => ({
    state: "next", 
    switchState: (state: translateButtonState) => {
        set({state: state})
    },
}))

export default useTranslateButtonStateNotifier
