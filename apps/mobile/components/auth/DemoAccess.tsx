import { StyleSheet, View } from 'react-native';
import { OtpInput } from 'react-native-otp-entry';

import useDemoSignIn from '@/hooks/useDemoSignIn';

export default function DemoAccess() {
    const { disabled, handleSubmit } = useDemoSignIn();

    return (
        <View style={styles.panel}>
            <OtpInput
                numberOfDigits={6}
                type="numeric"
                autoFocus={false}
                blurOnFilled
                disabled={disabled}
                focusColor="#666"
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

const styles = StyleSheet.create({
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
        borderColor: '#ddd',
        borderWidth: 1,
    },
    focusedDigit: {
        borderColor: 'black',
        borderWidth: 1.5,
    },
    digitText: {
        fontSize: 21,
        color: '#000',
    },
});
