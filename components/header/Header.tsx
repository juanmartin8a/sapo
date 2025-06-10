import { Pressable, StyleSheet, TouchableWithoutFeedback } from "react-native"
import { View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context";
import TranslateButton from "../header/TranslateButton";
import SidebarIcon from "../../assets/icons/sidebar.svg";
import { Text } from "react-native";

interface HeaderProps {
    onSidebarPress: () => void;
}

const Header = ({ onSidebarPress }: HeaderProps) => {
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.header, { height: 60 + insets.top, paddingTop: insets.top }]}>
            <View style={{ position: "absolute", height: "100%", left: 18, top: insets.top, justifyContent: "center" }}>
                <TouchableWithoutFeedback onPress={onSidebarPress}>
                    <View style={{ padding: 6 }}>
                        <SidebarIcon width={40} height={32} stroke="black" />
                    </View>
                </TouchableWithoutFeedback>
            </View>
            <Text style={styles.titleText}>
                {"S A P O"}
            </Text>

            <View style={{ zIndex: 1, position: "absolute", height: "100%", right: 18, top: insets.top, justifyContent: "center" }}>
                <TranslateButton />
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
