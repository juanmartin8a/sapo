import useTextToTranslate from "@/stores/textToTranslateStore"
import useTranslateButtonStateNotifier from "@/stores/translateButtonStateNotifier"
import { View } from "react-native"
import ArrowRightIcon  from "@/assets/icons/arrow-right.svg";
import SquareIcon from "@/assets/icons/square.svg";
import MoreHorizontalIcon from "@/assets/icons/more-horizontal.svg";

const TranslateButton = () => {
    const translateButtonState = useTranslateButtonStateNotifier((state) => state.state)
    const text = useTextToTranslate((state) => state.text)

    return (
        <View style={{padding: 6}}>
            {translateButtonState === 'next' && 
                <View style={{opacity: text !== "" ? 1.0 : 0.35}}>
                    <ArrowRightIcon width={32} height={32} stroke="black" />
                </View>
            }
            {translateButtonState === 'loading' && <MoreHorizontalIcon width={24} height={24} stroke="black" />}
            {translateButtonState === 'stop' && <SquareIcon width={18} height={18} stroke="black" fill="black" />}
        </View>
    )
}

export default TranslateButton
