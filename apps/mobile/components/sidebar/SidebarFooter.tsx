import type { AppTheme } from '@/constants/theme';
import useThemeStyles from '@/hooks/useThemeStyles';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Animated, StyleSheet, TouchableOpacity, Text, View } from 'react-native';
import LogInIcon from '@/assets/icons/log-in.svg';
import SettingsIcon from '@/assets/icons/settings.svg';
import { APP_ROUTES } from '@/constants/routes';
import { SUBSCRIPTION_PLAN_DISPLAY_NAMES } from '@/constants/subscription';
import useSkeletonPulse from '@/hooks/useSkeletonPulse';
import { useAuthState } from '@/providers/AuthStateProvider';
import useSubscriptionAccess from '@/hooks/useSubscriptionAccess';

const SIDEBAR_AVATAR_SIZE = 40;

const SidebarFooter = () => {
    const { styles, colors } = useThemeStyles(createStyles);
    const router = useRouter();
    const { status: authStatus, email } = useAuthState();
    const {
        hasActiveSubscription,
        isActivating: isSubscriptionActivating,
        isPending: isSubscriptionPending,
    } = useSubscriptionAccess();
    const shouldShowAuthSkeleton = authStatus === 'checking' && email === null;
    const shouldShowAccount = authStatus === 'authenticated' || email !== null;
    const subscriptionLabel = useMemo(() => {
        if (hasActiveSubscription === true) {
            return SUBSCRIPTION_PLAN_DISPLAY_NAMES.POLYGLOT;
        }

        return isSubscriptionActivating
            ? 'Activating...'
            : SUBSCRIPTION_PLAN_DISPLAY_NAMES.FREE;
    }, [hasActiveSubscription, isSubscriptionActivating])
    const emailInitial = useMemo(() => {
        return email?.[0]?.toUpperCase() ?? '?';
    }, [email])

    const skeletonOpacity = useSkeletonPulse(shouldShowAuthSkeleton || isSubscriptionPending);

    const handleSignInPress = useCallback(() => {
        router.push(APP_ROUTES.AUTH);
    }, [router]);

    const handleOpenSettings = useCallback(() => {
        router.push(APP_ROUTES.SETTINGS);
    }, [router]);

    return (
        <View style={styles.footer}>
            {shouldShowAuthSkeleton ? (
                <Animated.View
                    style={[styles.skeletonContainer, { opacity: skeletonOpacity }]}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                >
                    <View style={styles.skeletonAvatar} />
                    <View style={styles.skeletonTextContainer}>
                        <Text
                            style={[styles.emailText, styles.skeletonText, styles.emailSkeleton]}
                            numberOfLines={1}
                        >
                            {email ?? 'Account'}
                        </Text>
                        <Text
                            style={[styles.planText, styles.planLine, styles.skeletonText, styles.subscriptionSkeleton]}
                        >
                            {subscriptionLabel}
                        </Text>
                    </View>
                </Animated.View>
            ) : shouldShowAccount ? (
                <View style={styles.userActionsContainer}>
                    <TouchableOpacity
                        onPress={handleOpenSettings}
                        activeOpacity={0.7}
                        style={styles.userContainer}
                    >
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{emailInitial}</Text>
                        </View>
                        <View style={styles.userTextContainer}>
                            <Text style={styles.emailText} numberOfLines={1}>
                                {email ?? 'Account'}
                            </Text>
                            {isSubscriptionPending ? (
                                <Animated.Text
                                    style={[
                                        styles.planText,
                                        styles.planLine,
                                        styles.skeletonText,
                                        styles.subscriptionSkeleton,
                                        { opacity: skeletonOpacity },
                                    ]}
                                    accessibilityElementsHidden
                                    importantForAccessibility="no-hide-descendants"
                                >
                                    {subscriptionLabel}
                                </Animated.Text>
                            ) : (
                                <Text style={[styles.planText, styles.planLine]}>{subscriptionLabel}</Text>
                            )}
                        </View>
                    </TouchableOpacity>
                </View>
            ) : (
                <TouchableOpacity
                    onPress={handleSignInPress}
                    activeOpacity={0.7}
                    style={styles.signInButton}
                    accessibilityRole="button"
                >
                    <View style={styles.signInButtonContent}>
                        <LogInIcon width={20} height={20} stroke={colors.text} style={styles.signInButtonIcon} />
                        <Text style={styles.signInButtonText}>Sign in</Text>
                    </View>
                </TouchableOpacity>
            )}
            {!shouldShowAccount && (
                <TouchableOpacity
                    onPress={handleOpenSettings}
                    activeOpacity={0.7}
                    style={styles.settingsButton}
                    accessibilityRole="button"
                    accessibilityLabel="Settings"
                >
                    <SettingsIcon width={22} height={22} stroke={colors.text} />
                </TouchableOpacity>
            )}
        </View>
    )
}

const createStyles = ({ colors }: AppTheme) => StyleSheet.create({
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderTopWidth: 1,
        borderTopColor: colors.separator,
        paddingTop: 16,
    },
    userActionsContainer: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    skeletonContainer: {
        flex: 1,
        minWidth: 0,
        minHeight: SIDEBAR_AVATAR_SIZE,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    skeletonAvatar: {
        width: SIDEBAR_AVATAR_SIZE,
        height: SIDEBAR_AVATAR_SIZE,
        borderRadius: SIDEBAR_AVATAR_SIZE / 2,
        backgroundColor: colors.skeleton,
    },
    skeletonTextContainer: {
        flex: 1,
    },
    skeletonText: {
        alignSelf: 'flex-start',
        maxWidth: '100%',
        color: 'transparent',
    },
    emailSkeleton: {
        borderRadius: 6,
        backgroundColor: colors.skeleton,
    },
    subscriptionSkeleton: {
        borderRadius: 5,
        backgroundColor: colors.separator,
    },
    planLine: {
        marginTop: 4,
    },
    userContainer: {
        minHeight: 44,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    avatar: {
        width: SIDEBAR_AVATAR_SIZE,
        height: SIDEBAR_AVATAR_SIZE,
        borderRadius: SIDEBAR_AVATAR_SIZE / 2,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        color: colors.onPrimary,
        fontWeight: '700',
        fontSize: 16,
    },
    userTextContainer: {
        flex: 1,
    },
    emailText: {
        color: colors.text,
        fontWeight: '600',
        fontSize: 14,
    },
    planText: {
        color: colors.dimmed,
        fontSize: 12,
    },
    signInButton: {
        flex: 1,
        borderRadius: 12,
        backgroundColor: colors.raised,
        alignItems: 'center',
        flexDirection: 'row'
    },
    settingsButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: colors.raised,
        alignItems: 'center',
        justifyContent: 'center',
    },
    signInButtonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 12
    },
    signInButtonIcon: {
        marginRight: 12,
    },
    signInButtonText: {
        color: colors.text,
        fontWeight: '500',
        fontSize: 15,
    },
});

export default SidebarFooter;
