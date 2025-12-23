import React, { cloneElement, isValidElement, useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import AppleLogo from '@/assets/icons/apple_logo.svg';
import { authClient } from '@/clients/auth-client';

type SocialProvider = 'google' | 'apple';

interface SocialSignInButtonProps {
    provider: SocialProvider;
    label: string;
    icon?: React.ReactElement;
}

const SocialSignInButton = ({ provider, label, icon }: SocialSignInButtonProps) => {
    const isApple = provider === 'apple';
    const [loading, setLoading] = useState(false);
    const [isNativeAppleAuthAvailable, setIsNativeAppleAuthAvailable] = useState(false);

    useEffect(() => {
        if (!isApple) {
            setIsNativeAppleAuthAvailable(false);
            return;
        }

        if (Platform.OS !== 'ios') {
            setIsNativeAppleAuthAvailable(false);
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
    console.log("use apple native auth: ", shouldUseNativeAppleAuth)

    const handlePress = useCallback(async () => {
        setLoading(true);

        try {
            if (provider === 'google') {
                const data = await authClient.signIn.social({
                    provider: 'google',
                    callbackURL: '/'
                })

                console.log(data)


                return;
            }

            if (provider === 'apple' && shouldUseNativeAppleAuth) {
                const credential = await AppleAuthentication.signInAsync({
                    requestedScopes: [
                        AppleAuthentication.AppleAuthenticationScope.EMAIL,
                        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                    ],
                });

                const data = await authClient.signIn.social({
                    provider: 'apple',
                    idToken: {
                        token: credential.identityToken!,
                    }
                })

                console.log(data)

                return;
            }

            if (provider === 'apple') {
                const data = await authClient.signIn.social({
                    provider: 'apple',
                    callbackURL: '/'
                })
            }
        } catch (error) {
            console.warn(`${provider} sign-in failed`, error);
        } finally {
            setLoading(false);
        }
    }, [provider, shouldUseNativeAppleAuth]);

    return (
        <TouchableOpacity
            activeOpacity={0.9}
            style={[
                styles.button,
                provider === 'apple' ? styles.appleButton : styles.googleButton,
                // loading && styles.disabled,
            ]}
            onPress={handlePress}
            disabled={loading}
        >
            <View
                style={[
                    styles.content,
                ]}
            >
                {processedIcon}
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
        opacity: 0.6,
    },
});

export default SocialSignInButton;
