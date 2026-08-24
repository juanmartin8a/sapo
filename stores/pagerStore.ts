import { create } from 'zustand';
import useTranslateButtonStore from "@/stores/translateButtonStore"

interface PagerStoreState {
    // Page index position. This is the source of truth
    pos: number

    // Just needed to know where to change the pager's page/pos to in order to later animate to its value.
    // onPageSelected will then be triggered and `pos` will be updated.
    newPos: number


    setPos: (pos: number) => void
    goToPage: (pos: number) => void
}

const usePagerStore = create<PagerStoreState>((set, get) => ({
    pos: 0,
    newPos: 0,
    setPos: (pos: number) => {
        if (get().pos !== pos) {
            if (pos === 1) {
                const translateButtonState = useTranslateButtonStore.getState().state
                if (translateButtonState === "next") {
                    useTranslateButtonStore.getState().switchState("repeat")
                }
            } else {
                const translateButtonState = useTranslateButtonStore.getState().state
                if (translateButtonState === "repeat") {
                    useTranslateButtonStore.getState().switchState("next")
                }

            }
            set({ pos: pos, newPos: pos })
        }
    },
    goToPage: (pos: number) => {
        if (get().pos !== pos) {
            set({ newPos: pos })
        }
    }
}))

export default usePagerStore;
