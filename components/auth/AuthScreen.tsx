import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { APP_ROUTES } from '@/constants/routes';
import { UI_DISABLED_OPACITY } from '@/constants/ui';
import AuthLegalNotice from '@/components/auth/AuthLegalNotice';
import SocialSignInButton from '@/components/auth/SocialSignInButton';
import { useSignInStore } from '@/stores/signInStore';
import GoogleGIcon from '@/assets/icons/google-g.svg';
import ArrowLeftIcon from '@/assets/icons/arrow-left.svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SIGN_IN_TITLE = 'Sign in :)';
const SIGNING_IN_TITLE = 'Signing in...';
const TITLE_FADE_DURATION = 300;
const TITLE_FADE_EASING = Easing.out(Easing.cubic);
const SIGN_IN_SPACING = 12;

const AuthScreen = () => {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const pendingProvider = useSignInStore((state) => state.pendingProvider);
    const handleSignInStart = useSignInStore((state) => state.start);
    const handleSignInEnd = useSignInStore((state) => state.end);
    const [titleTransitionProgress] = useState(() => new Animated.Value(0));

    const handleBackPress = useCallback(() => {
        if (router.canGoBack()) {
            router.back();
            return;
        }

        router.replace(APP_ROUTES.HOME);
    }, [router]);

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
        <View
            style={[styles.container, { paddingTop: insets.top }]}
        >
            <View style={styles.mainContent}>
                <TouchableOpacity
                    accessibilityLabel="Go back"
                    accessibilityRole="button"
                    activeOpacity={0.7}
                    disabled={isSignInPending}
                    onPress={handleBackPress}
                    style={styles.backButton}
                >
                    <ArrowLeftIcon width={40} height={32} stroke="#000" />
                </TouchableOpacity>
                <View style={styles.content}>
                    <View style={styles.hero}>
                        <View style={styles.iconBadge}>
                            <Image
                                source={require("@/assets/images/sapo.png")}
                                resizeMode="contain"
                                style={styles.icon}
                            />
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
                        <View style={styles.titleLoader}>
                            {isSignInPending ? (
                                <ActivityIndicator
                                    size="small"
                                    color="#000"
                                    accessibilityRole="progressbar"
                                />
                            ) : null}
                        </View>
                    </View>
                </View>
            </View>
            <View style={[styles.footer, { paddingBottom: insets.bottom }]}>
                <View style={styles.buttons}>
                    <SocialSignInButton
                        provider="google"
                        label="Sign in with Google"
                        icon={<GoogleGIcon />}
                        loading={pendingProvider === 'google'}
                        disabled={isSignInPending}
                        onSignInStart={handleSignInStart}
                        onSignInCancel={handleSignInEnd}
                        onSignInError={handleSignInEnd}
                    />
                    <SocialSignInButton
                        provider="apple"
                        label="Sign in with Apple"
                        loading={pendingProvider === 'apple'}
                        disabled={isSignInPending}
                        onSignInStart={handleSignInStart}
                        onSignInCancel={handleSignInEnd}
                        onSignInError={handleSignInEnd}
                    />
                    <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityState={{ disabled: isSignInPending }}
                        disabled={isSignInPending}
                        activeOpacity={0.7}
                        style={[styles.demoToggle, isSignInPending && styles.disabled]}
                        onPress={() => router.navigate(APP_ROUTES.DEMO_ACCESS)}
                    >
                        <Text style={styles.demoLabel}>Demo access</Text>
                    </TouchableOpacity>
                </View>
                <View style={styles.legalNotice}>
                    <AuthLegalNotice />
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
    mainContent: {
        flex: 1,
        overflow: 'hidden',
    },
    footer: {
        paddingHorizontal: 28,
    },
    legalNotice: {
        paddingTop: SIGN_IN_SPACING,
        paddingBottom: 32,
    },
    content: {
        flex: 1,
        paddingHorizontal: 28,
        paddingTop: 32,
        paddingBottom: SIGN_IN_SPACING,
        backgroundColor: '#fff',
    },
    backButton: {
        position: 'absolute',
        top: 0,
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
    icon: {
        width: 112,
        height: 112,
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
        alignItems: 'center',
        justifyContent: 'center',
    },
    demoToggle: {
        alignSelf: 'flex-start',
        justifyContent: 'center',
    },
    disabled: {
        opacity: UI_DISABLED_OPACITY,
    },
    demoLabel: {
        fontSize: 12,
        lineHeight: 12,
        color: '#000',
        textDecorationLine: 'underline',
        fontWeight: '500',
    },
    buttons: {
        gap: SIGN_IN_SPACING,
    },
});

export default AuthScreen;
