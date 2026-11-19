import { Host, Text } from '@expo/ui/swift-ui';
import {
    font,
    foregroundStyle,
    lineSpacing,
    multilineTextAlignment,
    tint,
} from '@expo/ui/swift-ui/modifiers';
import { StyleSheet } from 'react-native';

import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from '@/constants/legal';
import { useAppTheme } from '@/providers/AppThemeProvider';

export default function AuthLegalNotice() {
    const { colors, scheme } = useAppTheme();
    return (
        <Host colorScheme={scheme} matchContents={{ vertical: true }} style={styles.host}>
            <Text markdownEnabled modifiers={[font({ size: 12 }), foregroundStyle(colors.muted), tint(colors.link), lineSpacing(5), multilineTextAlignment('center')]}>
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
