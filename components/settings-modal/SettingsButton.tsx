import type { ComponentType } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { SvgProps } from "react-native-svg";

import ChevronRightIcon from "../../assets/icons/chevron-right.svg";

type SettingsButtonIcon = ComponentType<SvgProps>;

interface SettingsButtonProps {
    text: string;
    onPress: () => void;
    leftIcon?: SettingsButtonIcon;
    showChevron?: boolean;
    backgroundColor?: string;
    borderRadius?: number;
    disabled?: boolean;
    loading?: boolean;
    textColor?: string;
    iconColor?: string;
    chevronColor?: string;
}

const SettingsButton = ({
    text,
    onPress,
    leftIcon: LeftIcon,
    showChevron = false,
    backgroundColor,
    borderRadius,
    disabled = false,
    loading = false,
    textColor = "#1E3526",
    iconColor = "#1E3526",
    chevronColor = "#5E755A",
}: SettingsButtonProps) => {
    return (
        <TouchableOpacity
            activeOpacity={0.8}
            disabled={disabled}
            onPress={onPress}
            style={[
                styles.button,
                backgroundColor ? { backgroundColor } : null,
                borderRadius !== undefined ? { borderRadius } : null,
                disabled && styles.disabled,
            ]}
        >
            <View style={styles.content}>
                {loading ? (
                    <ActivityIndicator color={iconColor} size="small" style={styles.leadingElement} />
                ) : (
                    LeftIcon && <LeftIcon width={20} height={20} stroke={iconColor} style={styles.leadingElement} />
                )}
                <Text style={[styles.text, { color: textColor }]}>{text}</Text>
                {showChevron ? <ChevronRightIcon width={20} height={20} stroke={chevronColor} /> : null}
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    button: {
        width: "100%",
    },
    content: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 12,
    },
    leadingElement: {
        marginRight: 12,
    },
    text: {
        flex: 1,
        fontSize: 15,
        fontWeight: "500",
    },
    disabled: {
        opacity: 0.5,
    },
});

export default SettingsButton;
