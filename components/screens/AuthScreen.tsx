import React from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import SocialSignInButton from '@/components/auth/SocialSignInButton';
import SapoIcon from '@/assets/icons/sapo.svg';
import GoogleGIcon from '@/assets/icons/google-g.svg';

const AuthScreen = () => {
    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
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
    footer: {
        alignItems: 'center',
        gap: 8,
    },
    footerText: {
        fontSize: 14,
        color: '#888',
        textAlign: 'center',
    },
});

export default AuthScreen;
