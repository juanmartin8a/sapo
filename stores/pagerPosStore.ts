import { create } from 'zustand';

interface PagerPosProps {
    // index: number,
    pos: number,

    setPos: (pos: number) => void
}

const usePagerPos = create<PagerPosProps>((set) => ({
    // index: 0,
    pos: 0,
    setPos: (pos: number) => {
        return set({pos: pos})
    },
}))

export default usePagerPos;
