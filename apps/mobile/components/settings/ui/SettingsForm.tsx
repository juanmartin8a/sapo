import type { ReactNode } from "react";
import { FieldGroup, Host } from "@expo/ui";
import { background, scrollContentBackground } from "@expo/ui/swift-ui/modifiers";
import { Platform } from "react-native";

import { useAppTheme } from "@/providers/AppThemeProvider";

interface SettingsFormProps {
    children: ReactNode;
}

export default function SettingsForm({ children }: SettingsFormProps) {
    const { scheme, settingsColors } = useAppTheme();
    const formModifiers = Platform.OS === "ios"
        ? [scrollContentBackground("hidden"), background(settingsColors.screenBackground)]
        : undefined;

    return (
        <Host colorScheme={scheme} style={{ flex: 1 }} seedColor={settingsColors.accent}>
            <FieldGroup
                style={{ backgroundColor: settingsColors.screenBackground }}
                modifiers={formModifiers}
            >
                {children}
            </FieldGroup>
        </Host>
    );
}
