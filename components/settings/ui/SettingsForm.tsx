import type { ReactNode } from "react";
import { FieldGroup, Host } from "@expo/ui";
import { background, scrollContentBackground } from "@expo/ui/swift-ui/modifiers";
import { Platform } from "react-native";

import { SETTINGS_COLORS } from "@/constants/settings";

const formModifiers = Platform.OS === "ios"
    ? [scrollContentBackground("hidden"), background(SETTINGS_COLORS.screenBackground)]
    : undefined;

interface SettingsFormProps {
    children: ReactNode;
}

export default function SettingsForm({ children }: SettingsFormProps) {
    return (
        <Host colorScheme="light" style={{ flex: 1 }} seedColor={SETTINGS_COLORS.accent}>
            <FieldGroup
                style={{ backgroundColor: SETTINGS_COLORS.screenBackground }}
                modifiers={formModifiers}
            >
                {children}
            </FieldGroup>
        </Host>
    );
}
