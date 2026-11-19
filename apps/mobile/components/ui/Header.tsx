import type { AppTheme } from '@/constants/theme';
import { TINOS } from '@/constants/fonts';
import useThemeStyles from '@/hooks/useThemeStyles';
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
    const { styles } = useThemeStyles(createStyles);
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

const createStyles = ({ colors }: AppTheme) => StyleSheet.create({
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
        color: colors.text,
        fontFamily: TINOS.bold,
        fontSize: 20,
    },
})

export default Header
