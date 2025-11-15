import React, { useEffect, useState } from 'react';
import { Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import SocialSignInButton from '@/components/auth/SocialSignInButton';
import SapoIcon from '@/assets/icons/sapo.svg';
import { useSignInWithApple } from '@clerk/clerk-expo';


const ProviderGlyph = ({ label, dark }: { label: string; dark?: boolean }) => (
    <Text style={[styles.providerGlyph, dark && styles.providerGlyphDark]}>{label}</Text>
);

const AuthScreen = () => {
    const [isAppleAuthAvailable, setIsAppleAuthAvailable] = useState(false);
    const { startAppleAuthenticationFlow } = useSignInWithApple()

    useEffect(() => {
        if (Platform.OS !== 'ios') {
            return;
        }

        let isMounted = true;

        AppleAuthentication.isAvailableAsync()
            .then((available) => {
                if (isMounted) {
                    setIsAppleAuthAvailable(available);
                }
            })
            .catch(() => {
                if (isMounted) {
                    setIsAppleAuthAvailable(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, []);

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                <View style={styles.hero}>
                    <View style={styles.iconBadge}>
                        <SapoIcon width={96} height={96} />
                    </View>
                    <Text style={styles.title}>Sign In :)</Text>
                </View>

                <View style={styles.buttons}>
                    {Platform.OS === 'ios'
                        ? isAppleAuthAvailable
                            ? (
                                <View style={styles.appleButtonWrapper}>
                                    <AppleAuthentication.AppleAuthenticationButton
                                        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                                        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                                        cornerRadius={12}
                                        style={styles.appleButton}
                                        onPress={async () => {
                                            try {
                                                const { createdSessionId, setActive } = await startAppleAuthenticationFlow()

                                                if (createdSessionId && setActive) {
                                                    await setActive({ session: createdSessionId })

                                                    // onSignInComplete ? onSignInComplete() : router.replace('/')
                                                }

                                                // signed in
                                            } catch (e) {
                                                if (e.code === 'ERR_REQUEST_CANCELED') {
                                                    // handle that the user canceled the sign-in flow
                                                } else {
                                                    // handle other errors
                                                }
                                            }
                                        }}
                                    />
                                </View>
                            )
                            : (
                                <SocialSignInButton
                                    label="Continue with Apple"
                                    onPress={() => { }}
                                    icon={<ProviderGlyph label="A" dark />}
                                    variant="dark"
                                />
                            )
                        : null}
                </View>

                {/* <View style={styles.footer}>
                    <Text style={styles.footerText}>Sign in to sync your sessions across devices.</Text>
                </View> */}
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#fff',
    },
    container: {
        flex: 1,
        paddingHorizontal: 28,
        paddingVertical: 32,
        justifyContent: 'space-between',
        backgroundColor: '#fff',
    },
    hero: {
        alignItems: 'center',
        gap: 16,
    },
    iconBadge: {
        width: 120,
        height: 120,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#000',
    },
    buttons: {
        gap: 14,
    },
    footer: {
        alignItems: 'center',
        gap: 8,
    },
    footerText: {
        fontSize: 14,
        color: '#888',
        textAlign: 'center',
    },
    providerGlyph: {
        fontSize: 16,
        fontWeight: '700',
        color: '#000',
    },
    providerGlyphDark: {
        color: '#fff',
    },
    appleButtonWrapper: {
        position: 'relative',
        overflow: 'hidden',
    },
    appleButton: {
        height: 42,
        width: '100%',
    },
});

export default AuthScreen;
