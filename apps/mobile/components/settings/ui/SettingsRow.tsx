import type { AppTheme } from '@/constants/theme';
import useThemeStyles from '@/hooks/useThemeStyles';
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import ChevronRightIcon from "@/assets/icons/chevron-right.svg";
import SettingsIcon from "@/components/settings/ui/SettingsIcon";
import type { SettingsRowProps } from "@/components/settings/ui/SettingsRow.types";
import {
    SETTINGS_ROW_CONTENT_SPACING,
} from "@/constants/settings";
import { UI_DISABLED_OPACITY } from "@/constants/ui";

export default function SettingsRow({
    label,
    icon,
    onPress,
    disabled = false,
    loading = false,
    destructive = false,
    showDisclosure = false,
}: SettingsRowProps) {
    const { styles, scheme, settingsColors: SETTINGS_COLORS } = useThemeStyles(createStyles);
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
                <ActivityIndicator color={scheme === 'dark' ? SETTINGS_COLORS.primaryText : undefined} size="small" />
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

const createStyles = ({ scheme, colors, settingsColors: SETTINGS_COLORS }: AppTheme) => StyleSheet.create({
    row: {
        minHeight: 48,
        width: "100%",
        flexDirection: "row",
        alignItems: "center",
        gap: SETTINGS_ROW_CONTENT_SPACING,
    },
    label: {
        color: scheme === 'light' ? colors.text : SETTINGS_COLORS.primaryText,
        flex: 1,
        fontSize: 17,
        fontWeight: "400",
    },
    destructive: {
        color: SETTINGS_COLORS.destructiveText,
    },
    disabled: {
        opacity: UI_DISABLED_OPACITY,
    },
    pressed: {
        opacity: 0.65,
    },
});
