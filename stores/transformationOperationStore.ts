import { create } from 'zustand';

export type TransformationOperation = 'translate' | 'respell';

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
