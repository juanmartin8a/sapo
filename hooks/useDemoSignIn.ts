import { useCallback } from 'react';
import { Alert, Keyboard } from 'react-native';
import { useRouter } from 'expo-router';

import { APP_ROUTES } from '@/constants/routes';
import { authClient, signInWithDemoCode } from '@/lib/auth-client';
import { useSignInStore } from '@/stores/signInStore';

function handleSignInError(message: string) {
    useSignInStore.getState().end('demo');
    Alert.alert('Sign-in failed', message);
}

export default function useDemoSignIn() {
    const router = useRouter();
    const disabled = useSignInStore((state) => state.pendingProvider !== null);

    const handleSubmit = useCallback(async (code: string) => {
        if (useSignInStore.getState().pendingProvider !== null || !/^\d{6}$/.test(code)) {
            return;
        }
        useSignInStore.getState().start('demo');
        try {
            Keyboard.dismiss();
            router.dismissTo(APP_ROUTES.AUTH);
            const result = await signInWithDemoCode(code);
            if (result.error) {
                handleSignInError(result.error.status === 429
                    ? 'Too many attempts. Try again later.'
                    : 'Incorrect access code. Please try again.');
                return;
            }
            const session = await authClient.getSession();
            if (session.error || !session.data) {
                throw new Error('Missing demo session');
            }
            // The existing auth gate handles navigation, Convex and RevenueCat identity.
        } catch {
            handleSignInError('Unable to sign in. Check your connection and try again.');
        }
    }, [router]);

    return { disabled, handleSubmit };
}
