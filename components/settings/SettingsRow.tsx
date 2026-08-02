import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import ChevronRightIcon from "@/assets/icons/chevron-right.svg";
import SettingsIcon from "@/components/settings/SettingsIcon";
import type { SettingsRowProps } from "@/components/settings/SettingsRow.types";
import { SETTINGS_COLORS } from "@/constants/settings";

export default function SettingsRow({
    label,
    icon,
    onPress,
    disabled = false,
    loading = false,
    destructive = false,
    showDisclosure = false,
}: SettingsRowProps) {
    return (
        <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => [
                styles.row,
                disabled && styles.disabled,
                pressed && styles.pressed,
            ]}
        >
            <SettingsIcon
                icon={icon}
                color={destructive ? SETTINGS_COLORS.destructiveText : SETTINGS_COLORS.primaryText}
            />
            <Text style={[styles.label, destructive && styles.destructive]}>{label}</Text>
            {loading ? (
                <ActivityIndicator size="small" />
            ) : showDisclosure ? (
                <ChevronRightIcon
                    width={18}
                    height={18}
                    stroke={SETTINGS_COLORS.mutedChevron}
                />
            ) : null}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    row: {
        minHeight: 48,
        width: "100%",
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    label: {
        flex: 1,
        fontSize: 17,
        fontWeight: "400",
    },
    destructive: {
        color: SETTINGS_COLORS.destructiveText,
    },
    disabled: {
        opacity: 0.45,
    },
    pressed: {
        opacity: 0.65,
    },
});
