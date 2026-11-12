import type { ReactNode } from "react";
import { FieldGroup, Host } from "@expo/ui";
import { background, scrollContentBackground } from "@expo/ui/swift-ui/modifiers";
import { Platform } from "react-native";

import { useAppTheme } from "@/providers/AppThemeProvider";

interface SettingsFormProps {
    children: ReactNode;
}

export default function SettingsForm({ children }: SettingsFormProps) {
    const { scheme, settingsColors: SETTINGS_COLORS } = useAppTheme();
    const formModifiers = Platform.OS === "ios"
        ? [scrollContentBackground("hidden"), background(SETTINGS_COLORS.screenBackground)]
        : undefined;

    return (
        <Host colorScheme={scheme} style={{ flex: 1 }} seedColor={SETTINGS_COLORS.accent}>
            <FieldGroup
                style={{ backgroundColor: SETTINGS_COLORS.screenBackground }}
                modifiers={formModifiers}
            >
                {children}
            </FieldGroup>
        </Host>
    );
}
