import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Appearance, StatusBar, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';

import { APP_THEMES, isThemePreference, THEME_STORAGE_KEY, type ThemePreference } from '@/constants/theme';

function readPreference(): ThemePreference {
    try {
        const saved = SecureStore.getItem(THEME_STORAGE_KEY);
        return isThemePreference(saved) ? saved : 'system';
    } catch {
        return 'system';
    }
}

const AppThemeContext = createContext({
    ...APP_THEMES.light,
    preference: 'system' as ThemePreference,
    setPreference: (_preference: ThemePreference) => {},
});

export default function AppThemeProvider({ children }: { children: ReactNode }) {
    // Read before the first render so a saved override never flashes the opposite theme.
    const [preference, setPreferenceState] = useState(readPreference);
    const systemScheme = useColorScheme();
    const scheme = preference === 'system' ? (systemScheme ?? 'light') : preference;
    const theme = APP_THEMES[scheme];

    useLayoutEffect(() => {
        // Also theme native alerts, keyboards, menus, and system bars.
        Appearance.setColorScheme(preference === 'system' ? 'auto' : preference);
    }, [preference]);

    const value = useMemo(() => ({
        ...theme,
        preference,
        setPreference: (next: ThemePreference) => {
            if (!isThemePreference(next)) return;
            try {
                SecureStore.setItem(THEME_STORAGE_KEY, next);
                setPreferenceState(next);
            } catch {
                Alert.alert('Could not save appearance', 'Please try again.');
            }
        },
    }), [preference, theme]);
    const navigationTheme = useMemo(() => ({
        ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
        colors: {
            ...(scheme === 'dark' ? DarkTheme : DefaultTheme).colors,
            primary: theme.colors.text,
            background: theme.colors.background,
            card: theme.colors.raised,
            text: theme.colors.text,
            border: theme.colors.border,
            notification: theme.settingsColors.destructiveText,
        },
    }), [scheme, theme]);

    return (
        <AppThemeContext value={value}>
            <ThemeProvider value={navigationTheme}>
                <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
                {children}
            </ThemeProvider>
        </AppThemeContext>
    );
}

export function useAppTheme() {
    return useContext(AppThemeContext);
}
