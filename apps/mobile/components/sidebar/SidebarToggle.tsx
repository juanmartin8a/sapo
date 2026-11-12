import type { AppTheme } from '@/constants/theme';
import useThemeStyles from '@/hooks/useThemeStyles';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { triggerSelectionHaptic } from '@/lib/haptics';

interface SidebarToggleProps {
    label: string;
    value: boolean;
    onValueChange: (enabled: boolean) => void;
}

export default function SidebarToggle({ label, value, onValueChange }: SidebarToggleProps) {
    const { styles } = useThemeStyles(createStyles);
    return (
        <View style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <Switch
                accessibilityLabel={label}
                value={value}
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
