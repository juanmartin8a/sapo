import { ReactNode } from "react";
import { StyleProp, StyleSheet, Text, TextStyle, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface HeaderProps {
    title: string;
    leftComponent: ReactNode;
    rightComponent: ReactNode;
    titleStyle?: StyleProp<TextStyle>;
}

const Header = ({ title, leftComponent, rightComponent, titleStyle }: HeaderProps) => {
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.header, { height: 60 + insets.top, paddingTop: insets.top }]}>
            <View style={[styles.sideContainer, { left: 18, top: insets.top }]}>
                {leftComponent}
            </View>

            <View style={styles.titleContainer}>
                <Text style={[styles.titleText, titleStyle]}>{title}</Text>
            </View>

            <View style={[styles.sideContainer, { right: 18, top: insets.top, alignItems: "flex-end" }]}>            
                {rightComponent}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    sideContainer: {
        position: "absolute",
        height: "100%",
        justifyContent: "center",
    },
    titleContainer: {
        position: 'relative',
        alignItems: 'center',
    },
    titleText: {
        fontSize: 20,
        fontWeight: 'bold',
    },
})

export default Header
