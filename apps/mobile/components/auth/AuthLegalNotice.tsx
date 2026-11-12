import type { AppTheme } from '@/constants/theme';
import useThemeStyles from '@/hooks/useThemeStyles';
import { Linking, StyleSheet, Text } from 'react-native';

import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from '@/constants/legal';

export default function AuthLegalNotice() {
    const { styles } = useThemeStyles(createStyles);
    return (
        <Text style={styles.notice}>
            {'By continuing, you agree to our '}
            <Text
                accessibilityRole="link"
                onPress={() => void Linking.openURL(TERMS_OF_USE_URL)}
                style={styles.link}
            >
                Terms of Use
            </Text>
            {' and acknowledge our '}
            <Text
                accessibilityRole="link"
                onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
                style={styles.link}
            >
                Privacy Policy
            </Text>
            .
        </Text>
    );
}

const createStyles = ({ colors }: AppTheme) => StyleSheet.create({
    notice: {
        color: colors.muted,
        fontSize: 12,
        lineHeight: 17,
        marginTop: 4,
        textAlign: 'center',
    },
    link: {
        color: colors.text,
        fontSize: 12,
        fontWeight: '600',
        lineHeight: 17,
    },
});
