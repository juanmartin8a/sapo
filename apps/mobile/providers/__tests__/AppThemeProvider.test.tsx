import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, Appearance } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AppThemeProvider, { useAppTheme } from '../AppThemeProvider';
import { APP_THEMES, THEME_STORAGE_KEY, type AppTheme } from '@/constants/theme';
import useThemeStyles from '@/hooks/useThemeStyles';

let mockSystemScheme: 'light' | 'dark' = 'light';
jest.mock('react-native', () => {
    const actual = jest.requireActual<typeof import('react-native')>('react-native');
    return { Alert: actual.Alert, Appearance: actual.Appearance, StatusBar: actual.StatusBar,
        useColorScheme: () => mockSystemScheme };
});
jest.mock('expo-secure-store', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('expo-router', () => ({
    DarkTheme: { dark: true, colors: {} },
    DefaultTheme: { dark: false, colors: {} },
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

let current: ReturnType<typeof useAppTheme>;
const createStyles = jest.fn(({ colors }: AppTheme) => ({ backgroundColor: colors.background }));

function Probe() {
    const theme = useAppTheme();
    useThemeStyles(createStyles);
    useLayoutEffect(() => { current = theme; }, [theme]);
    return null;
}

let renderer: ReactTestRenderer;
function mount() {
    act(() => { renderer = create(<AppThemeProvider><Probe /></AppThemeProvider>); });
}
function refresh() {
    act(() => { renderer.update(<AppThemeProvider><Probe /></AppThemeProvider>); });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockSystemScheme = 'light';
    jest.mocked(SecureStore.getItem).mockReturnValue(null);
    jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
    if (renderer) act(() => renderer.unmount());
    jest.restoreAllMocks();
});

test('defaults to system, follows live system changes, and swaps both frog poses', () => {
    mount();
    expect(current.preference).toBe('system');
    expect(current.scheme).toBe('light');
    expect(Appearance.setColorScheme).toHaveBeenCalledWith('auto');
    mockSystemScheme = 'dark';
    refresh();
    expect(current.scheme).toBe('dark');
    expect(current.colors.background).toBe('#000000');
    expect(current.frogs).toEqual(APP_THEMES.dark.frogs);
    expect(current.frogs.closed).not.toEqual(APP_THEMES.light.frogs.closed);
    expect(current.frogs.open).not.toEqual(APP_THEMES.light.frogs.open);
});

test('restores a saved override on the first render', () => {
    jest.mocked(SecureStore.getItem).mockReturnValue('dark');
    mount();
    expect(SecureStore.getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY);
    expect(current.scheme).toBe('dark');
    expect(current.preference).toBe('dark');
    expect(Appearance.setColorScheme).toHaveBeenCalledWith('dark');
    refresh();
    expect(current.scheme).toBe('dark');
});

test('reuses styles until the effective scheme changes', () => {
    mount();
    expect(createStyles).toHaveBeenCalledTimes(1);

    act(() => current.setPreference('light'));
    expect(current.preference).toBe('light');
    expect(createStyles).toHaveBeenCalledTimes(1);

    act(() => current.setPreference('dark'));
    expect(createStyles).toHaveBeenCalledTimes(2);
    expect(createStyles).toHaveBeenLastCalledWith(APP_THEMES.dark);
});

test('follows the system when native appearance overrides are unavailable', () => {
    const appearance: Partial<typeof Appearance> = Appearance;
    const setColorScheme = appearance.setColorScheme;
    appearance.setColorScheme = undefined;
    mockSystemScheme = 'dark';

    try {
        mount();
        expect(current.scheme).toBe('dark');
    } finally {
        appearance.setColorScheme = setColorScheme;
    }
});

test('persists choices, keeps overrides across system changes, and can return to system', () => {
    mount();
    act(() => current.setPreference('dark'));
    expect(SecureStore.setItem).toHaveBeenLastCalledWith(THEME_STORAGE_KEY, 'dark');
    expect(current.scheme).toBe('dark');
    refresh();
    expect(current.scheme).toBe('dark');
    act(() => current.setPreference('light'));
    mockSystemScheme = 'dark';
    refresh();
    expect(current.scheme).toBe('light');
    act(() => current.setPreference('system'));
    expect(current.scheme).toBe('dark');
    expect(Appearance.setColorScheme).toHaveBeenLastCalledWith('auto');
    expect(SecureStore.setItem).toHaveBeenLastCalledWith(THEME_STORAGE_KEY, 'system');
});

test.each(['invalid', ''])('ignores invalid stored preferences: %s', saved => {
    jest.mocked(SecureStore.getItem).mockReturnValue(saved);
    mount();
    expect(current.preference).toBe('system');
});

test('continues using system appearance if storage cannot be read', () => {
    jest.mocked(SecureStore.getItem).mockImplementationOnce(() => { throw new Error('locked'); });
    mount();
    expect(current.preference).toBe('system');
});

test('keeps the current choice and explains a failed save', () => {
    mount();
    jest.mocked(SecureStore.setItem).mockImplementationOnce(() => { throw new Error('unavailable'); });
    act(() => current.setPreference('dark'));
    expect(current.preference).toBe('system');
    expect(Alert.alert).toHaveBeenCalledWith('Could not save appearance', 'Please try again.');
});
