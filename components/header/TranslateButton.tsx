import useTextToTranslate from "@/stores/textToTranslateStore"
import useTranslateButtonStateNotifier from "@/stores/translateButtonStateNotifier"
import { View } from "react-native"
import ArrowRightIcon from "@/assets/icons/arrow-right.svg";
import RepeatIcon from "@/assets/icons/repeat.svg";
import SquareIcon from "@/assets/icons/square.svg";
import MoreHorizontalIcon from "@/assets/icons/more-horizontal.svg";
import usePagerPos from "@/stores/pagerPosStore";
import useWebSocketStore from "@/stores/websocketStore";

const TranslateButton = () => {
    const translateButtonState = useTranslateButtonStateNotifier((state) => state.state)
    const lastTranslation = useWebSocketStore.getState().lastTranslation
    const text = useTextToTranslate((state) => state.text)
    const offset = usePagerPos((state) => state.offset)

    const arrowOpacity = 1 - offset;
    const loadingOpacity = offset;

    return (
        <View style={{ padding: 6 }}>
            {(translateButtonState === 'next' || translateButtonState === 'repeat') &&
                <View style={{ position: 'relative', width: 32, height: 32 }}>
                    <View style={{ position: 'absolute', opacity: arrowOpacity }}>
                        <ArrowRightIcon style={{ opacity: text !== "" ? 1.0 : 0.35 }} width={32} height={32} stroke="black" />
                    </View>
                    {(lastTranslation !== null) &&
                        <View style={{ position: 'absolute', opacity: loadingOpacity }}>
                            <RepeatIcon width={32} height={32} stroke="black" />
                        </View>
                    }
                </View>
            }
            {translateButtonState === 'loading' && <MoreHorizontalIcon width={24} height={24} stroke="black" />}
            {translateButtonState === 'stop' && <SquareIcon width={18} height={18} stroke="black" fill="black" />}
        </View>
    )
}

export default TranslateButton
