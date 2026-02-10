import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import TrashIcon from '@/assets/icons/trash.svg';
import ArrowLeftIcon from '@/assets/icons/arrow-left.svg';
import Header from '@/components/header/Header';
import { authClient } from '@/clients/auth-client';

const Settings = () => {
    const insets = useSafeAreaInsets();
    const { data: session, isPending } = authClient.useSession();
    const user = session?.user;
    const [isProcessing, setIsProcessing] = useState(false);
    const router = useRouter();

    const handleGoBack = useCallback(() => {
        router.back();
    }, [router]);

    const handleDeleteAccount = useCallback(() => {
        if (isPending || !user || isProcessing) {
            return;
        }

        Alert.alert(
            'Delete account',
            'This action will permanently remove your account and data. Continue?',
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
                        } catch (error) {
                            setIsProcessing(false);
                            Alert.alert('Something went wrong', 'Unable to delete the account. Please try again.');
                        }
                    },
                },
            ]
        );
    }, [isProcessing, isPending, user]);

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
                        disabled={isProcessing}
                    >
                        <View style={styles.buttonContent}>
                            <TrashIcon width={20} height={20} stroke="#000" style={styles.buttonIcon} />
                            <Text style={styles.deleteButtonText}>Delete account</Text>
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
