import { create } from 'zustand';

export type TransformationMode = 'translate' | 'respell';

interface TranslateModeStoreProps {
    mode: TransformationMode;
    inputLimit: number;

    setMode: (mode: TransformationMode) => void;
}

const useTransformationModeStore = create<TranslateModeStoreProps>((set) => ({
    mode: 'respell',
    inputLimit: 1000,
    setMode: (mode: TransformationMode) => {
        set({ mode });
    },
}));

export default useTransformationModeStore;
