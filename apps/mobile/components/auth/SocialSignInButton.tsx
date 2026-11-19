import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

import AppleLogo from '@/assets/icons/apple-logo.svg';
import GoogleLogo from '@/assets/icons/google-g.svg';
import { UI_DISABLED_OPACITY } from '@/constants/ui';
import type { SocialProvider } from '@/types/auth';
import { authClient } from '@/lib/auth-client';
import { triggerLightImpactHaptic } from '@/lib/haptics';
import { useAppTheme } from '@/providers/AppThemeProvider';

const SOCIAL_SIGN_IN_BUTTON_HEIGHT = 44;

interface SocialSignInButtonProps {
    provider: SocialProvider;
    label: string;
    loading?: boolean;
    disabled?: boolean;
    onSignInStart: (provider: SocialProvider) => void;
    onSignInEnd: (provider: SocialProvider) => void;
}

const assertSocialSignInSucceeded = (
    result: Awaited<ReturnType<typeof authClient.signIn.social>>,
    provider: SocialProvider
) => {
    if (result.error) {
        if (__DEV__) {
            console.warn(`${provider} sign-in failed`, result.error);
        }

        throw new Error(`${provider} sign-in failed`);
    }
};

const isUserCancelledSignIn = (error: unknown) => {
    if (typeof error !== 'object' || error === null) {
        return false;
    }

    const errorRecord = error as { code?: unknown; message?: unknown; name?: unknown };
    const code = typeof errorRecord.code === 'string' ? errorRecord.code : null;

    if (code === 'ERR_REQUEST_CANCELED') {
        return true;
    }

    const name = typeof errorRecord.name === 'string' ? errorRecord.name.toLowerCase() : '';
    const message = typeof errorRecord.message === 'string' ? errorRecord.message.toLowerCase() : '';

    return name.includes('cancel') || message.includes('cancel') || message.includes('dismiss');
};

const SocialSignInButton = ({
    provider,
    label,
    loading = false,
    disabled = false,
    onSignInStart,
    onSignInEnd,
}: SocialSignInButtonProps) => {
    const { scheme } = useAppTheme();
    const isApple = provider === 'apple';
    const isBlackAppleButton = isApple && scheme === 'light';
    const [isNativeAppleAuthAvailable, setIsNativeAppleAuthAvailable] = useState(false);
    const isDisabled = disabled || loading;

    useEffect(() => {
        if (!isApple || Platform.OS !== 'ios') {
            return;
        }

        let isMounted = true;

        AppleAuthentication.isAvailableAsync()
            .then((available) => {
                if (isMounted) {
                    setIsNativeAppleAuthAvailable(available);
                }
            })
            .catch(() => {
                if (isMounted) {
                    setIsNativeAppleAuthAvailable(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [isApple]);

    const shouldUseNativeAppleAuth = isApple && isNativeAppleAuthAvailable;

    const confirmAuthenticatedSession = useCallback(async (treatMissingSessionAsCancel: boolean) => {
        const { data: nextSession } = await authClient.getSession();

        if (nextSession) {
            return;
        }

        if (treatMissingSessionAsCancel) {
            onSignInEnd(provider);
            return;
        }

        throw new Error(`${provider} sign-in completed without an authenticated session`);
    }, [onSignInEnd, provider]);

    const handlePress = useCallback(async () => {
        if (isDisabled) {
            return;
        }

        triggerLightImpactHaptic();
        onSignInStart(provider);

        try {
            if (shouldUseNativeAppleAuth) {
                const credential = await AppleAuthentication.signInAsync({
                    requestedScopes: [
                        AppleAuthentication.AppleAuthenticationScope.EMAIL,
                        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                    ],
                });

                if (!credential.identityToken) {
                    throw new Error('Apple sign-in did not return an identity token');
                }

                if (!credential.authorizationCode) {
                    throw new Error('Apple sign-in did not return an authorization code');
                }

                const result = await authClient.signIn.social({
                    provider: 'apple',
                    idToken: {
                        token: credential.identityToken,
                        refreshToken: credential.authorizationCode,
                        user: {
                            ...(credential.email ? { email: credential.email } : {}),
                            name: {
                                ...(credential.fullName?.givenName
                                    ? { firstName: credential.fullName.givenName }
                                    : {}),
                                ...(credential.fullName?.familyName
                                    ? { lastName: credential.fullName.familyName }
                                    : {}),
                            },
                        },
                    }
                });

                assertSocialSignInSucceeded(result, provider);
                await confirmAuthenticatedSession(false);

                return;
            }

            const result = await authClient.signIn.social({
                provider,
                callbackURL: '/',
            });

            assertSocialSignInSucceeded(result, provider);
            await confirmAuthenticatedSession(true);
        } catch (error) {
            if (isUserCancelledSignIn(error)) {
                onSignInEnd(provider);
                return;
            }

            if (__DEV__) {
                console.warn(`${provider} sign-in failed`, error);
            }

            Alert.alert('Sign-in failed', 'Please try again.');
            onSignInEnd(provider);
        }
    }, [confirmAuthenticatedSession, isDisabled, onSignInEnd, onSignInStart, provider, shouldUseNativeAppleAuth]);

    const Logo = isApple ? AppleLogo : GoogleLogo;
    const labelStyle = isBlackAppleButton ? styles.lightLabel : styles.darkLabel;
    const buttonStyle = scheme === 'dark'
        ? styles.whiteButton
        : isBlackAppleButton ? styles.appleButton : styles.googleButton;

    return (
        <TouchableOpacity
            activeOpacity={0.9}
            style={[
                styles.button,
                buttonStyle,
                isDisabled && styles.disabled,
            ]}
            onPress={handlePress}
            disabled={isDisabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: isDisabled, busy: loading }}
        >
            <View style={styles.content}>
                <View style={styles.leadingElement}>
                    <Logo
                        width={SOCIAL_SIGN_IN_BUTTON_HEIGHT}
                        height={SOCIAL_SIGN_IN_BUTTON_HEIGHT}
                        fill={isApple ? labelStyle.color : undefined}
                    />
                </View>
                <Text style={[styles.label, labelStyle]}>{label}</Text>
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    button: {
        width: '100%',
        height: SOCIAL_SIGN_IN_BUTTON_HEIGHT,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    googleButton: {
        backgroundColor: '#f2f2f2',
    },
    appleButton: {
        backgroundColor: '#000',
    },
    whiteButton: {
        backgroundColor: '#fff',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    leadingElement: {
        width: SOCIAL_SIGN_IN_BUTTON_HEIGHT,
        height: SOCIAL_SIGN_IN_BUTTON_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        fontSize: 17,
        fontWeight: '500',
    },
    darkLabel: {
        color: '#000',
    },
    lightLabel: {
        color: '#fff',
    },
    disabled: {
        opacity: UI_DISABLED_OPACITY,
    },
});

export default SocialSignInButton;
