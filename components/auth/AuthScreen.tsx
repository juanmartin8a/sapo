import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import SocialSignInButton, { type SocialProvider } from '@/components/auth/SocialSignInButton';
import SapoIcon from '@/assets/icons/sapo.svg';
import GoogleGIcon from '@/assets/icons/google-g.svg';
import ArrowLeftIcon from '@/assets/icons/arrow-left.svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SIGN_IN_TITLE = 'Sign in :)';
const SIGNING_IN_TITLE = 'Signing in...';
const TERMS_OF_USE_URL = 'https://sapo.surf/terms-of-use';
const PRIVACY_POLICY_URL = 'https://sapo.surf/privacy-policy';
const TITLE_FADE_DURATION = 300;
const TITLE_FADE_EASING = Easing.out(Easing.cubic);

const AuthScreen = () => {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [pendingProvider, setPendingProvider] = useState<SocialProvider | null>(null);
    const [pressedLegalLink, setPressedLegalLink] = useState<'terms' | 'privacy' | null>(null);
    const [titleTransitionProgress] = useState(() => new Animated.Value(0));

    const handleSignInEnd = useCallback((provider: SocialProvider) => {
        setPendingProvider((currentProvider) => currentProvider === provider ? null : currentProvider);
    }, []);

    const handleBackPress = useCallback(() => {
        if (router.canGoBack()) {
            router.back();
            return;
        }

        router.replace('/');
    }, [router]);

    const handleOpenTermsOfUse = useCallback(() => {
        void Linking.openURL(TERMS_OF_USE_URL);
    }, []);

    const handleOpenPrivacyPolicy = useCallback(() => {
        void Linking.openURL(PRIVACY_POLICY_URL);
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
            <TouchableOpacity
                accessibilityLabel="Go back"
                accessibilityRole="button"
                activeOpacity={0.7}
                disabled={isSignInPending}
                onPress={handleBackPress}
                style={[styles.backButton, { top: insets.top }]}
            >
                <ArrowLeftIcon width={40} height={32} stroke="#000" />
            </TouchableOpacity>
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
                    <Text style={styles.legalNotice}>
                        {'By continuing, you agree to our '}
                        <Text
                            accessibilityRole="link"
                            onPress={handleOpenTermsOfUse}
                            onPressIn={() => setPressedLegalLink('terms')}
                            onPressOut={() => setPressedLegalLink(null)}
                            style={[styles.legalLink, pressedLegalLink === 'terms' && styles.legalLinkPressed]}
                            suppressHighlighting
                        >
                            Terms of Use
                        </Text>
                        {' and acknowledge our '}
                        <Text
                            accessibilityRole="link"
                            onPress={handleOpenPrivacyPolicy}
                            onPressIn={() => setPressedLegalLink('privacy')}
                            onPressOut={() => setPressedLegalLink(null)}
                            style={[styles.legalLink, pressedLegalLink === 'privacy' && styles.legalLinkPressed]}
                            suppressHighlighting
                        >
                            Privacy Policy
                        </Text>
                        .
                    </Text>
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
    backButton: {
        position: 'absolute',
        left: 18,
        padding: 6,
        zIndex: 1,
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
    legalNotice: {
        color: '#666',
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
    },
    legalLink: {
        color: '#1C1C1E',
        fontWeight: '600',
    },
    legalLinkPressed: {
        color: '#8E8E93',
    },
});

export default AuthScreen;
