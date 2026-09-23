import { create } from 'zustand';
import type { TransformationOperation } from "@/types/translation";

interface TransformationOperationStoreProps {
    operation: TransformationOperation;
    translateThenRespell: boolean;
    setTranslateThenRespell: (enabled: boolean) => void;

    setOperation: (operation: TransformationOperation) => void;
}

const useTransformationOperationStore = create<TransformationOperationStoreProps>((set) => ({
    operation: 'translate',
    translateThenRespell: false,
    setTranslateThenRespell: (translateThenRespell) => set({ translateThenRespell }),
    setOperation: (operation: TransformationOperation) => {
        set({ operation });
    },
}));

export default useTransformationOperationStore;
