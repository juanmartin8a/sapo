import { create } from 'zustand';
import useTranslateButtonStateNotifier from "@/stores/translateButtonStateNotifier"

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
            set({ pos: pos, offset: pos })
        }
    },
    setOffset: (offset: number) => {
        if (offset > 0 && offset < 1) {
            set({ offset: offset })
        }
    },
}))

export default usePagerPos;
