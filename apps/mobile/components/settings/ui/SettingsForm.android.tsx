import type { ReactNode } from 'react';
import { FieldGroup } from '@expo/ui';
import { Host } from '@expo/ui/jetpack-compose';
import { useAppTheme } from '@/providers/AppThemeProvider';

export default function SettingsForm({ children }: { children: ReactNode }) {
    const { scheme, settingsColors } = useAppTheme();

    return (
        <Host
            colorScheme={scheme}
            seedColor={settingsColors.accent}
            style={{ flex: 1 }}
            // Preserve the original seeded light palette and customize dark grouped surfaces.
            colorOverrides={scheme === 'dark' ? {
                primary: settingsColors.accent,
                onPrimary: settingsColors.screenBackground,
                surface: settingsColors.screenBackground,
                surfaceContainer: settingsColors.surface,
                onSurface: settingsColors.primaryText,
                onSurfaceVariant: settingsColors.mutedText,
                error: settingsColors.destructiveText,
            } : undefined}
        >
            <FieldGroup style={{ backgroundColor: settingsColors.screenBackground }}>
                {children}
            </FieldGroup>
        </Host>
    );
}
