import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import DemoAccess from '@/components/auth/DemoAccess';

export default function DemoAccessScreen() {
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <Text style={styles.description}>Enter your six-digit access code:</Text>
            <DemoAccess />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingTop: 32,
        paddingHorizontal: 28,
        backgroundColor: '#fff',
        gap: 20,
    },
    description: {
        fontSize: 15,
        lineHeight: 22,
        color: '#666',
    },
});
