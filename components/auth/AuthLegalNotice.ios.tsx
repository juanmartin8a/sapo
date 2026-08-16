import { Host, Text } from '@expo/ui/swift-ui';
import {
    font,
    foregroundStyle,
    lineSpacing,
    multilineTextAlignment,
    tint,
} from '@expo/ui/swift-ui/modifiers';
import { StyleSheet } from 'react-native';

const TERMS_OF_USE_URL = 'https://sapo.surf/terms-of-use';
const PRIVACY_POLICY_URL = 'https://sapo.surf/privacy-policy';

const textModifiers = [
    font({ size: 12 }),
    foregroundStyle('#666'),
    tint('#1C1C1E'),
    lineSpacing(5),
    multilineTextAlignment('center'),
];

export default function AuthLegalNotice() {
    return (
        <Host matchContents={{ vertical: true }} style={styles.host}>
            <Text markdownEnabled modifiers={textModifiers}>
                {`By continuing, you agree to our **[Terms of Use](${TERMS_OF_USE_URL})** and acknowledge our **[Privacy Policy](${PRIVACY_POLICY_URL})**.`}
            </Text>
        </Host>
    );
}

const styles = StyleSheet.create({
    host: {
        marginTop: 4,
        width: '100%',
    },
});
