import { RNHostView, Row, Spacer, Text } from "@expo/ui";
import { CircularProgressIndicator } from "@expo/ui/jetpack-compose";
import { fillMaxWidth, size } from "@expo/ui/jetpack-compose/modifiers";

import ChevronRightIcon from "@/assets/icons/chevron-right.svg";
import SettingsIcon from "@/components/settings/ui/SettingsIcon";
import type { SettingsRowProps } from "@/components/settings/ui/SettingsRow.types";
import {
    SETTINGS_COLORS,
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
    return (
        <Row
            alignment="center"
            spacing={SETTINGS_ROW_CONTENT_SPACING}
            disabled={disabled}
            modifiers={[fillMaxWidth()]}
            onPress={onPress}
            style={disabled ? { opacity: UI_DISABLED_OPACITY } : undefined}
        >
            <RNHostView matchContents>
                <SettingsIcon
                    icon={icon}
                    color={destructive ? SETTINGS_COLORS.destructiveText : SETTINGS_COLORS.primaryText}
                />
            </RNHostView>
            <Text textStyle={{ color: destructive ? SETTINGS_COLORS.destructiveText : SETTINGS_COLORS.primaryText }}>
                {label}
            </Text>
            <Spacer flexible />
            {loading ? (
                <CircularProgressIndicator modifiers={[size(20, 20)]} />
            ) : showDisclosure ? (
                <RNHostView matchContents>
                    <ChevronRightIcon
                        width={18}
                        height={18}
                        stroke={SETTINGS_COLORS.mutedChevron}
                    />
                </RNHostView>
            ) : null}
        </Row>
    );
}
