import useTextToTranslate from "@/stores/textToTranslateStore"
import useTranslateButtonStateNotifier from "@/stores/translateButtonStateNotifier"
import { View } from "react-native"
import ArrowRightIcon  from "@/assets/icons/arrow-right.svg";
import RepeatIcon  from "@/assets/icons/repeat.svg";
import SquareIcon from "@/assets/icons/square.svg";
import MoreHorizontalIcon from "@/assets/icons/more-horizontal.svg";
import usePagerPos from "@/stores/pagerPosStore";

const TranslateButton = () => {
    const translateButtonState = useTranslateButtonStateNotifier((state) => state.state)
    const text = useTextToTranslate((state) => state.text)
    const pos = usePagerPos((state) => state.pos)

    const arrowOpacity = 1 - pos;
    const loadingOpacity = pos;

    return (
        <View style={{padding: 6}}>
            {translateButtonState === 'next' && 
                <View style={{position: 'relative', width: 32, height: 32}}>
                    <View style={{position: 'absolute', opacity: arrowOpacity}}>
                        <ArrowRightIcon width={32} height={32} stroke="black" />
                    </View>
                    <View style={{position: 'absolute', opacity: loadingOpacity}}>
                        <RepeatIcon width={32} height={32} stroke="black" />
                    </View>
                </View>
            }
            {translateButtonState === 'loading' && <MoreHorizontalIcon width={24} height={24} stroke="black" />}
            {translateButtonState === 'stop' && <SquareIcon width={18} height={18} stroke="black" fill="black" />}
        </View>
    )
}

export default TranslateButton
