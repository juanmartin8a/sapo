import { StyleSheet, Switch, Text, View } from 'react-native';

import { triggerSelectionHaptic } from '@/lib/haptics';

interface SidebarToggleProps {
    label: string;
    value: boolean;
    onValueChange: (enabled: boolean) => void;
}

export default function SidebarToggle({ label, value, onValueChange }: SidebarToggleProps) {
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

const styles = StyleSheet.create({
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
        color: 'black',
        marginRight: 12,
    },
});
