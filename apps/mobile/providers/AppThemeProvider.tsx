import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
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

const darkTheme = APP_THEMES.dark;
const darkNavigationTheme = {
    ...DarkTheme,
    colors: {
        ...DarkTheme.colors,
        primary: darkTheme.colors.text,
        background: darkTheme.colors.background,
        card: darkTheme.colors.raised,
        text: darkTheme.colors.text,
        border: darkTheme.colors.border,
        notification: darkTheme.settingsColors.destructiveText,
    },
};

export default function AppThemeProvider({ children }: { children: ReactNode }) {
    // Read before the first render so a saved override never flashes the opposite theme.
    const [preference, setPreferenceState] = useState(readPreference);
    const systemScheme = useColorScheme();
    const scheme = preference === 'system' ? (systemScheme ?? 'light') : preference;
    const theme = APP_THEMES[scheme];

    useLayoutEffect(() => {
        // Also theme native alerts, keyboards, menus, and system bars.
        Appearance.setColorScheme?.(preference === 'system' ? 'auto' : preference);
    }, [preference]);

    const setPreference = useCallback((next: ThemePreference) => {
        if (!isThemePreference(next)) return;

        try {
            SecureStore.setItem(THEME_STORAGE_KEY, next);
            setPreferenceState(next);
        } catch {
            Alert.alert('Could not save appearance', 'Please try again.');
        }
    }, []);

    const value = useMemo(() => ({
        ...theme,
        preference,
        setPreference,
    }), [preference, setPreference, theme]);

    return (
        <AppThemeContext value={value}>
            <ThemeProvider value={scheme === 'light' ? DefaultTheme : darkNavigationTheme}>
                <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
                {children}
            </ThemeProvider>
        </AppThemeContext>
    );
}

export function useAppTheme() {
    return useContext(AppThemeContext);
}
