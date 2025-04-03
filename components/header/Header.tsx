import { StyleSheet, TouchableWithoutFeedback } from "react-native"
import { View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context";
import TranslateButton from "../header/TranslateButton";
import ArrowRightIcon  from "../../assets/icons/arrow-right.svg";
import SquareIcon from "../../assets/icons/square.svg";
import MoreHorizontalIcon from "../../assets/icons/more-horizontal.svg";
import SidebarIcon from "../../assets/icons/sidebar.svg";
import useTranslateButtonStateNotifier from "@/stores/translateButtonStateNotifier";
import { Text } from "react-native";
import useTextToTranslate from "@/stores/textToTranslateStore";

interface HeaderProps {
  onSidebarPress: () => void
  onNextPress: () => void
}

const Header = ({ onSidebarPress, onNextPress }: HeaderProps) => {
    const insets = useSafeAreaInsets();
    const translateButtonState = useTranslateButtonStateNotifier((state) => state.state)
    const text = useTextToTranslate((state) => state.text)

    return (
        <View style={[styles.header, {height: 60 + insets.top, paddingTop: insets.top}]}>
            <View style={{position: "absolute", height: "100%", left: 18, top: insets.top, justifyContent:"center"}}>
                <TouchableWithoutFeedback onPress={onSidebarPress}>
                    <View style={{padding: 6}}>
                        <SidebarIcon width={40} height={32} stroke="black"/>
                    </View>
                </TouchableWithoutFeedback>
            </View>
            <Text style={styles.titleText}>
                {"S.A.P.O"}
            </Text>
            
            <View style={{position: "absolute", height: "100%", right: 18, top: insets.top, justifyContent:"center"}}>
                <TouchableWithoutFeedback onPress={onNextPress}>
                    <View style={{padding: 6}}>
                    {translateButtonState === 'next' && 
                        <View style={{opacity: text !== "" ? 1.0 : 0.35}}>
                            <ArrowRightIcon width={32} height={32} stroke="black" />
                        </View>
                    }
                    {translateButtonState === 'loading' && <MoreHorizontalIcon width={24} height={24} stroke="black" />}
                    {translateButtonState === 'stop' && <SquareIcon width={18} height={18} stroke="black" fill="black" />}
                    </View>
                </TouchableWithoutFeedback>
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    header: {
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    titleText: {
        fontSize: 20,
        fontWeight: 'bold',
    },
})

export default Header
