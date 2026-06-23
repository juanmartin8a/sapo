import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, View } from 'react-native';
import SocialSignInButton, { type SocialProvider } from '@/components/auth/SocialSignInButton';
import SapoIcon from '@/assets/icons/sapo.svg';
import GoogleGIcon from '@/assets/icons/google-g.svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SIGN_IN_TITLE = 'Sign in :)';
const SIGNING_IN_TITLE = 'Signing in...';
const TITLE_FADE_DURATION = 300;
const TITLE_FADE_EASING = Easing.out(Easing.cubic);

const AuthScreen = () => {
    const insets = useSafeAreaInsets();
    const [pendingProvider, setPendingProvider] = useState<SocialProvider | null>(null);
    const [titleTransitionProgress] = useState(() => new Animated.Value(0));

    const handleSignInEnd = useCallback((provider: SocialProvider) => {
        setPendingProvider((currentProvider) => currentProvider === provider ? null : currentProvider);
    }, []);

    const isSignInPending = pendingProvider !== null;

    useEffect(() => {
        titleTransitionProgress.stopAnimation();
        Animated.timing(titleTransitionProgress, {
            toValue: isSignInPending ? 1 : 0,
            duration: TITLE_FADE_DURATION,
            easing: TITLE_FADE_EASING,
            useNativeDriver: true,
        }).start();
    }, [isSignInPending, titleTransitionProgress]);

    const signInTitleOpacity = titleTransitionProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
    });
    const signingInTitleOpacity = titleTransitionProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
    });

    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <View style={styles.content}>
                <View style={styles.hero}>
                    <View style={styles.iconBadge}>
                        <SapoIcon width={112} height={112} />
                    </View>
                    <View
                        accessibilityLiveRegion="polite"
                        accessibilityLabel={isSignInPending ? SIGNING_IN_TITLE : SIGN_IN_TITLE}
                        accessible
                        style={styles.titleContainer}
                    >
                        <Animated.Text
                            accessible={false}
                            importantForAccessibility="no"
                            style={[styles.title, styles.titleMeasure]}
                        >
                            {SIGNING_IN_TITLE}
                        </Animated.Text>
                        <Animated.Text
                            accessible={false}
                            importantForAccessibility="no"
                            style={[styles.title, styles.titleLayer, { opacity: signInTitleOpacity }]}
                        >
                            {SIGN_IN_TITLE}
                        </Animated.Text>
                        <Animated.Text
                            accessible={false}
                            importantForAccessibility="no"
                            style={[styles.title, styles.titleLayer, { opacity: signingInTitleOpacity }]}
                        >
                            {SIGNING_IN_TITLE}
                        </Animated.Text>
                    </View>
                    {isSignInPending ? (
                        <ActivityIndicator
                            size="small"
                            color="#000"
                            style={styles.titleLoader}
                            accessibilityRole="progressbar"
                        />
                    ) : null}
                </View>

                <View style={styles.buttons}>
                    <SocialSignInButton
                        provider="google"
                        label="Sign in with Google"
                        icon={<GoogleGIcon width="44" height="44" />}
                        loading={pendingProvider === 'google'}
                        disabled={isSignInPending}
                        onSignInStart={setPendingProvider}
                        onSignInCancel={handleSignInEnd}
                        onSignInError={handleSignInEnd}
                    />
                    <SocialSignInButton
                        provider="apple"
                        label="Sign in with Apple"
                        loading={pendingProvider === 'apple'}
                        disabled={isSignInPending}
                        onSignInStart={setPendingProvider}
                        onSignInCancel={handleSignInEnd}
                        onSignInError={handleSignInEnd}
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
    titleContainer: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    titleMeasure: {
        opacity: 0,
    },
    titleLayer: {
        ...StyleSheet.absoluteFill,
        textAlign: 'center',
    },
    titleLoader: {
        width: 24,
        height: 24,
    },
    buttons: {
        gap: 14,
    },
});

export default AuthScreen;
