import { create } from 'zustand';

export type TransformationOperation = 'translate' | 'respell';

interface TransformationOperationStoreProps {
    operation: TransformationOperation;
    inputLimit: number;

    setOperation: (operation: TransformationOperation) => void;
}

const useTransformationOperationStore = create<TransformationOperationStoreProps>((set) => ({
    operation: 'respell',
    inputLimit: 1000,
    setOperation: (operation: TransformationOperation) => {
        set({ operation });
    },
}));

export default useTransformationOperationStore;
