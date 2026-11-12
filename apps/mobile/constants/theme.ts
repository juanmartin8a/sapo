import { SETTINGS_COLORS } from '@/constants/settings';

export const THEME_OPTIONS = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
] as const;
export type ThemePreference = typeof THEME_OPTIONS[number]['value'];
export const THEME_ICONS = {
    system: 'sun-moon',
    light: 'sun',
    dark: 'moon',
} as const;
export type ColorScheme = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'sapo.appearance';

export function isThemePreference(value: unknown): value is ThemePreference {
    return THEME_OPTIONS.some(option => option.value === value);
}

const lightColors = {
    background: '#ffffff',
    raised: '#f2f2f2',
    text: '#000000',
    muted: '#666666',
    subtle: '#767676',
    border: '#dddddd',
    separator: '#eeeeee',
    strongBorder: '#171717',
    primary: '#000000',
    onPrimary: '#ffffff',
    skeleton: '#e7e7e7',
    selection: '#dce8cb',
    shadow: '#18231d',
} as const;

export interface AppTheme {
    scheme: ColorScheme;
    colors: { [Key in keyof typeof lightColors]: `#${string}` };
    settingsColors: { [Key in keyof typeof SETTINGS_COLORS]: `#${string}` };
    frogs: { closed: number; open: number };
}

// Match the website's site-theme.css palette, including its dark frog artwork.
export const APP_THEMES: Record<ColorScheme, AppTheme> = {
    light: {
        scheme: 'light',
        colors: lightColors,
        settingsColors: SETTINGS_COLORS,
        frogs: {
            closed: require('@/assets/images/sapo.png'),
            open: require('@/assets/images/sapo-mouth-open.png'),
        },
    },
    dark: {
        scheme: 'dark',
        colors: {
            background: '#101010',
            raised: '#222222',
            text: '#e8e8e8',
            muted: '#adadad',
            subtle: '#adadad',
            border: '#333333',
            separator: '#333333',
            strongBorder: '#757575',
            primary: '#e8e8e8',
            onPrimary: '#101010',
            skeleton: '#333333',
            selection: '#3d3d3d',
            shadow: '#000000',
        },
        settingsColors: {
            screenBackground: '#101010',
            surface: '#222222',
            primaryText: '#e8e8e8',
            mutedText: '#adadad',
            mutedChevron: '#adadad',
            accent: '#d4d4d4',
            destructiveText: '#ffabab',
        },
        frogs: {
            closed: require('@/assets/images/sapo-dark.png'),
            open: require('@/assets/images/sapo-mouth-open-dark.png'),
        },
    },
};
