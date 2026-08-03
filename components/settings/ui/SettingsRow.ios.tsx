import { Button, HStack, Image, ProgressView, RNHostView, Spacer, Text } from "@expo/ui/swift-ui";
import {
    buttonStyle,
    contentShape,
    controlSize,
    disabled,
    font,
    foregroundStyle,
    imageScale,
    listRowBackground,
    shapes,
} from "@expo/ui/swift-ui/modifiers";

import SettingsIcon from "@/components/settings/ui/SettingsIcon";
import type { SettingsRowProps } from "@/components/settings/ui/SettingsRow.types";
import { SETTINGS_COLORS, SETTINGS_ROW_CONTENT_SPACING } from "@/constants/settings";

export default function SettingsRow({
    label,
    icon,
    onPress,
    disabled: isDisabled = false,
    loading = false,
    destructive = false,
    showDisclosure = false,
}: SettingsRowProps) {
    return (
        <Button
            onPress={onPress}
            modifiers={[
                buttonStyle("plain"),
                disabled(isDisabled),
                listRowBackground(SETTINGS_COLORS.surface),
            ]}
        >
            <HStack
                spacing={SETTINGS_ROW_CONTENT_SPACING}
                modifiers={[contentShape(shapes.rectangle())]}
            >
                <RNHostView matchContents>
                    <SettingsIcon
                        icon={icon}
                        color={destructive ? SETTINGS_COLORS.destructiveText : SETTINGS_COLORS.primaryText}
                    />
                </RNHostView>
                <Text
                    modifiers={[
                        font({ textStyle: "body", weight: "regular" }),
                        foregroundStyle(
                            destructive ? SETTINGS_COLORS.destructiveText : SETTINGS_COLORS.primaryText
                        ),
                    ]}
                >
                    {label}
                </Text>
                <Spacer />
                {loading ? (
                    <ProgressView modifiers={[controlSize("small")]} />
                ) : showDisclosure ? (
                    <Image
                        systemName="chevron.forward"
                        modifiers={[
                            font({ textStyle: "body", weight: "semibold" }),
                            imageScale("small"),
                            foregroundStyle({ type: "hierarchical", style: "tertiary" }),
                        ]}
                    />
                ) : null}
            </HStack>
        </Button>
    );
}
