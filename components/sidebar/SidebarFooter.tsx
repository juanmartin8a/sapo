import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, TouchableOpacity, Text, View } from 'react-native';
import LogInIcon from '@/assets/icons/log-in.svg';
import useSubscriptionStatusStore from '@/stores/subscriptionStatusStore';
import { APP_ROUTES } from '@/constants/routes';
import { SUBSCRIPTION_PLAN_DISPLAY_NAMES } from '@/constants/subscription';
import { useAuthState } from '@/providers/AuthStateProvider';

const SidebarFooter = () => {
    const router = useRouter();
    const { status, userId, email } = useAuthState();
    const subscriptionUserId = useSubscriptionStatusStore((state) => state.userId);
    const hasActiveSubscription = useSubscriptionStatusStore((state) => state.hasActiveSubscription);
    const isSubscriptionPending = status === 'authenticated' &&
        (subscriptionUserId !== userId || hasActiveSubscription === null);
    const subscriptionLabel = useMemo(() => {
        const isCurrentUserSubscribed = subscriptionUserId === userId &&
            hasActiveSubscription === true;
        return isCurrentUserSubscribed
            ? SUBSCRIPTION_PLAN_DISPLAY_NAMES.POLYGLOT
            : SUBSCRIPTION_PLAN_DISPLAY_NAMES.FREE;
    }, [hasActiveSubscription, subscriptionUserId, userId])
    const emailInitial = useMemo(() => {
        return email?.[0]?.toUpperCase() ?? '?';
    }, [email])

    const handleSignInPress = useCallback(() => {
        router.push(APP_ROUTES.AUTH);
    }, [router]);

    const handleOpenSettings = useCallback(() => {
        router.push(APP_ROUTES.SETTINGS);
    }, [router]);

    return (
        <View style={styles.footer}>
            {status === 'checking' ? (
                <View
                    style={styles.skeletonContainer}
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
                </View>
            ) : status === 'authenticated' ? (
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
                                <Text
                                    style={[
                                        styles.planText,
                                        styles.planLine,
                                        styles.skeletonText,
                                        styles.subscriptionSkeleton,
                                    ]}
                                    accessibilityElementsHidden
                                    importantForAccessibility="no-hide-descendants"
                                >
                                    {subscriptionLabel}
                                </Text>
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
                >
                    <View style={styles.signInButtonContent}>
                        <LogInIcon width={20} height={20} stroke="#000" style={styles.signInButtonIcon} />
                        <Text style={styles.signInButtonText}>Sign in</Text>
                    </View>
                </TouchableOpacity>
            )}
        </View>
    )
}

const styles = StyleSheet.create({
    footer: {
        borderTopWidth: 1,
        borderTopColor: '#eee',
        paddingTop: 16,
    },
    userActionsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    skeletonContainer: {
        minHeight: 40,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    skeletonAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#e7e7e7',
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
        backgroundColor: '#e7e7e7',
    },
    subscriptionSkeleton: {
        borderRadius: 5,
        backgroundColor: '#eeeeee',
    },
    planLine: {
        marginTop: 4,
    },
    userContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#000',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 16,
    },
    userTextContainer: {
        flex: 1,
    },
    emailText: {
        color: '#000',
        fontWeight: '600',
        fontSize: 14,
    },
    planText: {
        color: '#888',
        fontSize: 12,
    },
    signInButton: {
        width: '100%',
        borderRadius: 12,
        backgroundColor: '#f2f2f2',
        alignItems: 'flex-start',
        flexDirection: 'row'
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
        color: '#000',
        fontWeight: '500',
        fontSize: 15,
    },
});

export default SidebarFooter;
