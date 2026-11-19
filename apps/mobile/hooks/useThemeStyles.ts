import { useMemo } from 'react';
import { APP_THEMES, type AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/providers/AppThemeProvider';

export default function useThemeStyles<T>(createStyles: (theme: AppTheme) => T) {
    const { scheme } = useAppTheme();
    const theme = APP_THEMES[scheme];
    const styles = useMemo(() => createStyles(theme), [createStyles, theme]);
    return { ...theme, styles };
}
