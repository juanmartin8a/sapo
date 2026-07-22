import React, { cloneElement, isValidElement, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import AppleLogo from '@/assets/icons/apple_logo.svg';
import { authClient } from '@/lib/auth-client';

export type SocialProvider = 'google' | 'apple';

interface SocialSignInButtonProps {
    provider: SocialProvider;
    label: string;
    icon?: React.ReactElement<{ width?: number; height?: number }>;
    loading?: boolean;
    disabled?: boolean;
    onSignInStart?: (provider: SocialProvider) => void;
    onSignInCancel?: (provider: SocialProvider) => void;
    onSignInError?: (provider: SocialProvider) => void;
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
    icon,
    loading = false,
    disabled = false,
    onSignInStart,
    onSignInCancel,
    onSignInError,
}: SocialSignInButtonProps) => {
    const isApple = provider === 'apple';
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

    const processedIcon = useMemo(() => {
        if (icon) {
            if (isValidElement(icon)) {
                return cloneElement(icon, {
                    width: 44,
                    height: 44,
                });
            }

            return icon;
        }

        if (isApple) {
            return <AppleLogo width={44} height={44} />;
        }

        return null;
    }, [icon, isApple]);

    const shouldUseNativeAppleAuth = isApple && isNativeAppleAuthAvailable;

    const confirmAuthenticatedSession = useCallback(async (treatMissingSessionAsCancel: boolean) => {
        const { data: nextSession } = await authClient.getSession();

        if (nextSession) {
            return;
        }

        if (treatMissingSessionAsCancel) {
            onSignInCancel?.(provider);
            return;
        }

        throw new Error(`${provider} sign-in completed without an authenticated session`);
    }, [onSignInCancel, provider]);

    const handlePress = useCallback(async () => {
        if (isDisabled) {
            return;
        }

        onSignInStart?.(provider);

        try {
            if (provider === 'google') {
                const result = await authClient.signIn.social({
                    provider: 'google',
                    callbackURL: '/auth'
                })

                assertSocialSignInSucceeded(result, provider);
                await confirmAuthenticatedSession(true);

                return;
            }

            if (provider === 'apple' && shouldUseNativeAppleAuth) {
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
                })

                assertSocialSignInSucceeded(result, provider);
                await confirmAuthenticatedSession(false);

                return;
            }

            if (provider === 'apple') {
                const result = await authClient.signIn.social({
                    provider: 'apple',
                    callbackURL: '/auth'
                })

                assertSocialSignInSucceeded(result, provider);
                await confirmAuthenticatedSession(true);
            }
        } catch (error) {
            if (isUserCancelledSignIn(error)) {
                onSignInCancel?.(provider);
                return;
            }

            if (__DEV__) {
                console.warn(`${provider} sign-in failed`, error);
            }

            Alert.alert('Sign-in failed', 'Please try again.');
            onSignInError?.(provider);
        }
    }, [confirmAuthenticatedSession, isDisabled, onSignInCancel, onSignInError, onSignInStart, provider, shouldUseNativeAppleAuth]);

    return (
        <TouchableOpacity
            activeOpacity={0.9}
            style={[
                styles.button,
                provider === 'apple' ? styles.appleButton : styles.googleButton,
                isDisabled && styles.disabled,
            ]}
            onPress={handlePress}
            disabled={isDisabled}
            accessibilityState={{ disabled: isDisabled, busy: loading }}
        >
            <View
                style={[
                    styles.content,
                ]}
            >
                {processedIcon ? (
                    <View style={styles.leadingElement}>
                        {processedIcon}
                    </View>
                ) : (
                    null
                )}
                <Text
                    style={[
                        styles.label,
                        provider === 'apple' ? styles.appleLabel : styles.googleLabel,
                    ]}
                >
                    {label}
                </Text>
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    button: {
        width: '100%',
        height: 44,
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
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    leadingElement: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        fontSize: 17,
        fontWeight: '500',
    },
    googleLabel: {
        color: '#000',
    },
    appleLabel: {
        color: '#fff',
    },
    disabled: {
        opacity: 0.5,
    },
});

export default SocialSignInButton;
