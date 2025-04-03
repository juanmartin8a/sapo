import { create } from 'zustand';

interface useTextToTranslateProps {
    text: string;
  
    setText: (text: string) => void;
}

const useTextToTranslate = create<useTextToTranslateProps>((set) => ({
    text: "", 
    setText: (text: string) => {
        set({text: text}) 
    },
}))

export default useTextToTranslate
