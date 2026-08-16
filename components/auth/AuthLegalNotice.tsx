import { Linking, StyleSheet, Text } from 'react-native';

const TERMS_OF_USE_URL = 'https://sapo.surf/terms-of-use';
const PRIVACY_POLICY_URL = 'https://sapo.surf/privacy-policy';

export default function AuthLegalNotice() {
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

const styles = StyleSheet.create({
    notice: {
        color: '#666',
        fontSize: 12,
        marginTop: 4,
        textAlign: 'center',
    },
    link: {
        color: '#1C1C1E',
        fontSize: 12,
        fontWeight: '600',
    },
});
