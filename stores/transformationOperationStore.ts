import { create } from 'zustand';
import type { TransformationOperation } from "@/types/translation";

interface TransformationOperationStoreProps {
    operation: TransformationOperation;

    setOperation: (operation: TransformationOperation) => void;
}

const useTransformationOperationStore = create<TransformationOperationStoreProps>((set) => ({
    operation: 'respell',
    setOperation: (operation: TransformationOperation) => {
        set({ operation });
    },
}));

export default useTransformationOperationStore;
