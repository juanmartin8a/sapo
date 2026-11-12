import { useMemo } from 'react';
import type { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/providers/AppThemeProvider';

export default function useThemeStyles<T>(createStyles: (theme: AppTheme) => T) {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [createStyles, theme]);
    return { ...theme, styles };
}
