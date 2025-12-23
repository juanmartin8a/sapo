import React, { useCallback, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import SocialSignInButton from '@/components/auth/SocialSignInButton';
import SapoIcon from '@/assets/icons/sapo.svg';
import GoogleGIcon from '@/assets/icons/google-g.svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import ArrowLeftIcon from '@/assets/icons/arrow-left.svg';
import { authClient } from '@/clients/auth-client';

const AuthScreen = () => {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { data: session, isPending } = authClient.useSession()

    const handleGoBack = useCallback(() => {
        router.back();
    }, [router]);

    useEffect(() => {
        if (isPending || !session) {
            return;
        }

        router.back();
    }, [isPending, session, router]);

    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <View style={[styles.backButtonContainer, { top: insets.top }]}>
                <TouchableOpacity onPress={handleGoBack} activeOpacity={0.7} style={styles.backButton}>
                    <ArrowLeftIcon width={24} height={24} stroke="#000" />
                </TouchableOpacity>
            </View>
            <View style={styles.content}>
                <View style={styles.hero}>
                    <View style={styles.iconBadge}>
                        <SapoIcon width={112} height={112} />
                    </View>
                    <Text style={styles.title}>Sign In :)</Text>
                </View>

                <View style={styles.buttons}>
                    <SocialSignInButton
                        provider="google"
                        label="Sign in with Google"
                        icon={<GoogleGIcon width="44" height="44" />}
                    />
                    <SocialSignInButton
                        provider="apple"
                        label="Sign in with Apple"
                    />
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    backButtonContainer: {
        position: 'absolute',
        left: 18,
        zIndex: 1,
    },
    backButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        flex: 1,
        paddingHorizontal: 28,
        paddingVertical: 32,
        justifyContent: 'space-between',
        backgroundColor: '#fff',
    },
    hero: {
        alignItems: 'center',
        gap: 24,
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
});

export default AuthScreen;
