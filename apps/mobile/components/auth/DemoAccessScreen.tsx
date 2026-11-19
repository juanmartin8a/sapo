import type { AppTheme } from '@/constants/theme';
import useThemeStyles from '@/hooks/useThemeStyles';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import DemoAccess from '@/components/auth/DemoAccess';

export default function DemoAccessScreen() {
    const { styles } = useThemeStyles(createStyles);
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <Text style={styles.description}>Enter your six-digit access code:</Text>
            <DemoAccess />
        </View>
    );
}

const createStyles = ({ colors }: AppTheme) => StyleSheet.create({
    container: {
        paddingTop: 32,
        paddingHorizontal: 28,
        backgroundColor: colors.background,
        gap: 20,
    },
    description: {
        fontSize: 15,
        lineHeight: 22,
        color: colors.muted,
    },
});
