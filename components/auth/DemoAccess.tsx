import { Alert, Keyboard, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { OtpInput } from 'react-native-otp-entry';
import { authClient, signInWithDemoCode } from '@/lib/auth-client';
import { APP_ROUTES } from '@/constants/routes';
import { useSignInStore } from '@/stores/signInStore';

export default function DemoAccess() {
    const router = useRouter();
    const disabled = useSignInStore((state) => state.pendingProvider !== null);

    const fail = (message: string) => {
        useSignInStore.getState().end('demo');
        Alert.alert('Sign-in failed', message);
    };

    const submit = async (code: string) => {
        if (useSignInStore.getState().pendingProvider !== null || !/^\d{6}$/.test(code)) return;
        useSignInStore.getState().start('demo');
        Keyboard.dismiss();
        router.dismissTo(APP_ROUTES.AUTH);
        try {
            const result = await signInWithDemoCode(code);
            if (result.error) {
                fail(result.error.status === 429
                    ? 'Too many attempts. Try again later.'
                    : 'Incorrect access code. Please try again.');
                return;
            }
            const session = await authClient.getSession();
            if (session.error || !session.data) throw new Error('Missing demo session');
            // The existing auth gate handles navigation, Convex and RevenueCat identity.
        } catch {
            fail('Unable to sign in. Check your connection and try again.');
        }
    };

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
                onFilled={(code) => { void submit(code); }}
                textInputProps={{ accessibilityLabel: 'Six-digit demo access code', autoComplete: 'off', caretHidden: true }}
                theme={{ containerStyle: styles.otp, pinCodeContainerStyle: styles.digit, focusedPinCodeContainerStyle: styles.focusedDigit, pinCodeTextStyle: styles.digitText }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    panel: { gap: 12, paddingBottom: 8 },
    otp: { width: 264, maxWidth: '100%', alignSelf: 'center' },
    digit: { flex: 1, maxWidth: 38, height: 46, marginHorizontal: 2, borderRadius: 8, borderColor: '#ddd', borderWidth: 1 },
    focusedDigit: { borderColor: 'black', borderWidth: 1.5 },
    digitText: { fontSize: 21, color: '#000' },
});
