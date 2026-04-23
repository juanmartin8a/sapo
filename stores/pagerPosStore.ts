import { create } from 'zustand';
import useTranslateButtonStateNotifier from "@/stores/translateButtonStateNotifier"

interface PagerPosProps {
    // Page index position. This is the source of truth
    pos: number
    offset: number

    // Just needed to know where to change the pager's page/pos to in order to later animate to its value.
    // onPageSelected will then be triggered and `pos` will be updated.
    newPos: number


    setPos: (pos: number) => void
    setOffset: (offset: number) => void
    goToPage: (pos: number) => void
}

const usePagerPos = create<PagerPosProps>((set, get) => ({
    pos: 0,
    offset: 0,
    newPos: 0,
    setPos: (pos: number) => {
        if (get().pos !== pos) {
            if (pos === 1) {
                const translateButtonState = useTranslateButtonStateNotifier.getState().state
                if (translateButtonState === "next") {
                    useTranslateButtonStateNotifier.getState().switchState("repeat")
                }
            } else {
                const translateButtonState = useTranslateButtonStateNotifier.getState().state
                if (translateButtonState === "repeat") {
                    useTranslateButtonStateNotifier.getState().switchState("next")
                }

            }
            set({ pos: pos, offset: pos, newPos: pos })
        }
    },
    setOffset: (offset: number) => {
        if (offset > 0 && offset < 1) {
            set({ offset: offset })
        }
    },
    goToPage: (pos: number) => {
        if (get().pos !== pos) {
            set({ newPos: pos })
        }
    }
}))

export default usePagerPos;
