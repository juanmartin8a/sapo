import type { AppTheme } from '@/constants/theme';
import useThemeStyles from '@/hooks/useThemeStyles';
import { StyleSheet, View } from 'react-native';
import { OtpInput } from 'react-native-otp-entry';

import useDemoSignIn from '@/hooks/useDemoSignIn';

export default function DemoAccess() {
    const { styles, colors } = useThemeStyles(createStyles);
    const { disabled, handleSubmit } = useDemoSignIn();

    return (
        <View style={styles.panel}>
            <OtpInput
                numberOfDigits={6}
                type="numeric"
                autoFocus={false}
                blurOnFilled
                disabled={disabled}
                focusColor={colors.muted}
                hideStick
                onFilled={(code) => {
                    void handleSubmit(code);
                }}
                textInputProps={{
                    accessibilityLabel: 'Six-digit demo access code',
                    autoComplete: 'off',
                    caretHidden: true,
                }}
                theme={{
                    containerStyle: styles.otp,
                    pinCodeContainerStyle: styles.digit,
                    focusedPinCodeContainerStyle: styles.focusedDigit,
                    pinCodeTextStyle: styles.digitText,
                }}
            />
        </View>
    );
}

const createStyles = ({ colors }: AppTheme) => StyleSheet.create({
    panel: {
        gap: 12,
        paddingBottom: 8,
    },
    otp: {
        width: 264,
        maxWidth: '100%',
        alignSelf: 'center',
    },
    digit: {
        flex: 1,
        maxWidth: 38,
        height: 46,
        marginHorizontal: 2,
        borderRadius: 8,
        borderColor: colors.border,
        borderWidth: 1,
    },
    focusedDigit: {
        borderColor: colors.text,
        borderWidth: 1.5,
    },
    digitText: {
        fontSize: 21,
        color: colors.text,
    },
});
