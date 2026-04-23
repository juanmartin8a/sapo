import React, { useCallback, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import TrashIcon from '@/assets/icons/trash.svg';
import ArrowLeftIcon from '@/assets/icons/arrow-left.svg';
import Header from '@/components/header/Header';
import { authClient } from '@/clients/auth-client';
import {
    getRevenueCatCustomerInfo,
    hasActiveRevenueCatSubscription,
    hasRevenueCatConfig,
    isRevenueCatSupportedPlatform,
} from '@/clients/revenuecat';
import { getSessionUserAuthState } from '@/utils/auth';

const getDeleteAccountAlertMessage = (args: {
    hasActiveSubscription: boolean;
    storeAccountLabel: string;
}) => {
    if (!args.hasActiveSubscription) {
        return 'This action will permanently delete your SAPO account and data. Continue?';
    }

    return `This action will permanently delete your SAPO account and data. Your subscription is managed by ${args.storeAccountLabel}, not SAPO, so deleting your account will not cancel store billing. Manage or cancel your subscription in your ${args.storeAccountLabel} subscription settings before deleting your account if needed. Continue?`;
};

const Settings = () => {
    const insets = useSafeAreaInsets();
    const { data: session, isPending } = authClient.useSession();
    const user = session?.user;
    const authState = getSessionUserAuthState(user);
    const isAuthenticatedUser = authState === 'authenticated';
    const canDeleteAccount = isAuthenticatedUser;
    const userId = isAuthenticatedUser ? user?.id ?? null : null;
    const [isProcessing, setIsProcessing] = useState(false);
    const router = useRouter();

    const handleGoBack = useCallback(() => {
        router.back();
    }, [router]);

    const handleDeleteAccount = useCallback(async () => {
        if (isPending || !canDeleteAccount || isProcessing) {
            return;
        }

        setIsProcessing(true);

        const storeAccountLabel =
            Platform.OS === 'android' ? 'Google' : Platform.OS === 'ios' ? 'Apple' : 'store';
        let hasActiveSubscription = false;

        if (
            userId &&
            isRevenueCatSupportedPlatform &&
            hasRevenueCatConfig()
        ) {
            try {
                const customerInfo = await getRevenueCatCustomerInfo(userId);
                hasActiveSubscription = customerInfo
                    ? hasActiveRevenueCatSubscription(customerInfo)
                    : false;
            } catch {
                hasActiveSubscription = true;
            }
        }

        setIsProcessing(false);

        Alert.alert(
            'Delete account',
            getDeleteAccountAlertMessage({
                hasActiveSubscription,
                storeAccountLabel,
            }),
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setIsProcessing(true);
                            await authClient.deleteUser({
                                callbackURL: '/'
                            });
                            setIsProcessing(false);
                            Alert.alert(
                                'Check your email',
                                'We sent a verification link to confirm account deletion.'
                            );
                        } catch {
                            setIsProcessing(false);
                            Alert.alert('Something went wrong', 'Unable to delete the account. Please try again.');
                        }
                    },
                },
            ]
        );
    }, [canDeleteAccount, isProcessing, isPending, userId]);

    return (
        <View style={styles.container}>
            <Header
                title="Settings"
                titleStyle={styles.headerTitle}
                leftComponent={(
                    <TouchableOpacity onPress={handleGoBack} activeOpacity={0.7} style={styles.backButton}>
                        <ArrowLeftIcon width={24} height={24} stroke="#000" />
                    </TouchableOpacity>
                )}
                rightComponent={<View style={{ width: 24 }} />}
            />
            <View style={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
                <View style={styles.deleteButtonWrapper}>
                    <TouchableOpacity
                        style={[styles.deleteButton, isProcessing && styles.buttonDisabled]}
                        onPress={handleDeleteAccount}
                        activeOpacity={0.7}
                        disabled={isProcessing || !canDeleteAccount}
                    >
                        <View style={styles.buttonContent}>
                            <TrashIcon width={20} height={20} stroke="#000" style={styles.buttonIcon} />
                            <Text style={styles.deleteButtonText}>
                                {!isAuthenticatedUser
                                    ? 'Sign in to manage data'
                                    : isProcessing
                                      ? 'Preparing deletion...'
                                      : 'Delete account'}
                            </Text>
                        </View>
                    </TouchableOpacity>
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
    headerTitle: {
        fontSize: 18,
    },
    backButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        flex: 1,
    },
    deleteButtonWrapper: {
        backgroundColor: 'rgba(255, 77, 77, 0.12)',
        padding: 24,
    },
    deleteButton: {
        backgroundColor: '#fff',
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderRadius: 12,
        alignItems: 'flex-start',
        width: '100%',
    },
    buttonText: {
        color: '#000',
        fontWeight: '500',
        fontSize: 15,
    },
    deleteButtonText: {
        color: '#000',
        fontWeight: '500',
        fontSize: 15,
    },
    buttonContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    buttonIcon: {
        marginRight: 12,
    },
    buttonPressed: {
        backgroundColor: '#f2f2f2',
    },
    buttonDisabled: {
        opacity: 0.5,
    },
});

export default Settings;
