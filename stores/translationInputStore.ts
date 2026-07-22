import { create } from 'zustand';

interface TranslationInputStoreState {
    text: string;
  
    setText: (text: string) => void;
}

const useTranslationInputStore = create<TranslationInputStoreState>((set) => ({
    text: "", 
    setText: (text: string) => {
        set({text: text}) 
    },
}))

export default useTranslationInputStore
