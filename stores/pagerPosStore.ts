import { create } from 'zustand';

interface PagerPosProps {
    pos: number
    offset: number

    setPos: (pos: number) => void
    setOffset: (offset: number) => void
}

const usePagerPos = create<PagerPosProps>((set, get) => ({
    pos: 0,
    offset: 0,
    setPos: (pos: number) => {
        if (get().pos !== pos) {
            set({pos: pos, offset: pos})
        }
    },
    setOffset: (offset: number) => {
        if (offset > 0 && offset < 1) {
            set({offset: offset})
        }
    },
}))

export default usePagerPos;
