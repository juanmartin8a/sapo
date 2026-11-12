import type { ReactNode } from 'react';
import { FieldGroup } from '@expo/ui';
import { Host } from '@expo/ui/jetpack-compose';
import { useAppTheme } from '@/providers/AppThemeProvider';

export default function SettingsForm({ children }: { children: ReactNode }) {
    const { scheme, colors, settingsColors } = useAppTheme();

    return (
        <Host
            colorScheme={scheme}
            seedColor={settingsColors.accent}
            style={{ flex: 1 }}
            // Keep Material controls native while matching the website's neutral dark surfaces.
            colorOverrides={scheme === 'dark' ? {
                primary: colors.text,
                onPrimary: colors.onPrimary,
                primaryContainer: colors.raised,
                onPrimaryContainer: colors.text,
                secondary: colors.muted,
                onSecondary: colors.onPrimary,
                secondaryContainer: colors.raised,
                onSecondaryContainer: colors.text,
                surface: colors.background,
                surfaceVariant: colors.raised,
                surfaceDim: colors.background,
                surfaceBright: colors.raised,
                surfaceContainer: colors.raised,
                surfaceContainerLow: '#191919',
                surfaceContainerLowest: colors.background,
                surfaceContainerHigh: '#292929',
                surfaceContainerHighest: colors.border,
                onSurface: colors.text,
                onSurfaceVariant: colors.muted,
                surfaceTint: colors.text,
                outline: colors.strongBorder,
                outlineVariant: colors.border,
                error: settingsColors.destructiveText,
            } : undefined}
        >
            <FieldGroup style={{ backgroundColor: settingsColors.screenBackground }}>
                {children}
            </FieldGroup>
        </Host>
    );
}
