import type { AppTheme } from '@/constants/theme';
import useThemeStyles from '@/hooks/useThemeStyles';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { triggerSelectionHaptic } from '@/lib/haptics';

interface SidebarToggleProps {
    label: string;
    value: boolean;
    onValueChange: (enabled: boolean) => void;
    lightThumb?: boolean;
}

export default function SidebarToggle({ label, value, onValueChange, lightThumb = false }: SidebarToggleProps) {
    const { scheme, styles } = useThemeStyles(createStyles);
    return (
        <View style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <Switch
                accessibilityLabel={label}
                value={value}
                thumbColor={scheme === 'dark' ? (lightThumb ? '#ffffff' : '#666666') : undefined}
                onValueChange={(enabled) => {
                    triggerSelectionHaptic();
                    onValueChange(enabled);
                }}
            />
        </View>
    );
}

const createStyles = ({ colors }: AppTheme) => StyleSheet.create({
    field: {
        width: '100%',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexDirection: 'row',
    },
    label: {
        flex: 1,
        fontSize: 15,
        fontWeight: '500',
        color: colors.text,
        marginRight: 12,
    },
});
