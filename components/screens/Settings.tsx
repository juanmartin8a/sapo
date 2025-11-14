import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';

import LogOutIcon from '@/assets/icons/log-out.svg';
import TrashIcon from '@/assets/icons/trash.svg';
import MoveLeftIcon from '@/assets/icons/move-left.svg';
import Header from '@/components/header/Header';

const Settings = () => {
    const insets = useSafeAreaInsets();
    const { signOut, isLoaded: isAuthLoaded } = useAuth();
    const { user, isLoaded: isUserLoaded } = useUser();
    const [isProcessing, setIsProcessing] = useState(false);
    const router = useRouter();

    const handleGoBack = useCallback(() => {
        router.back();
    }, [router]);

    const handleSignOut = useCallback(async () => {
        if (!isAuthLoaded || isProcessing) {
            return;
        }

        try {
            setIsProcessing(true);
            await signOut();
        } catch (error) {
            Alert.alert('Something went wrong', 'Unable to sign out. Please try again.');
        } finally {
            setIsProcessing(false);
        }
    }, [isAuthLoaded, isProcessing, signOut]);

    const handleDeleteAccount = useCallback(() => {
        if (!isUserLoaded || !user || isProcessing) {
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
                            await user.delete();
                            await signOut();
                        } catch (error) {
                            setIsProcessing(false);
                            Alert.alert('Something went wrong', 'Unable to delete the account. Please try again.');
                        }
                    },
                },
            ]
        );
    }, [isProcessing, isUserLoaded, signOut, user]);

    return (
        <View style={styles.container}>
            <Header
                title="Settings"
                titleStyle={styles.headerTitle}
                leftComponent={(
                    <TouchableOpacity onPress={handleGoBack} activeOpacity={0.7} style={styles.backButton}>
                        <MoveLeftIcon width={24} height={24} stroke="#000" />
                    </TouchableOpacity>
                )}
                rightComponent={<View style={{ width: 24 }} />}
            />
            <View style={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
                <Pressable
                    style={({ pressed }) => [
                        styles.button,
                        pressed && styles.buttonPressed,
                        isProcessing && styles.buttonDisabled,
                    ]}
                    onPress={handleSignOut}
                    disabled={isProcessing}
                >
                    <View style={styles.buttonContent}>
                        <LogOutIcon width={20} height={20} stroke="#000" style={styles.buttonIcon} />
                        <Text style={styles.buttonText}>Sign out</Text>
                    </View>
                </Pressable>
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
        paddingHorizontal: 24,
        paddingTop: 24,
    },
    backButton: {
        padding: 6,
    },
    button: {
        backgroundColor: 'transparent',
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderRadius: 0,
        alignItems: 'flex-start',
        width: '100%',
    },
    deleteButtonWrapper: {
        backgroundColor: 'rgba(255, 77, 77, 0.12)',
        // borderRadius: 12,
        marginTop: 32,
        // marginHorizontal: 24,
        padding: 24,
        // width: '100%',
    },
    deleteButton: {
        backgroundColor: '#fff',
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderRadius: 8,
        alignItems: 'flex-start',
        width: '100%',
    },
    buttonText: {
        color: '#000',
        fontWeight: '600',
        fontSize: 16,
    },
    deleteButtonText: {
        color: '#000',
        fontWeight: '600',
        fontSize: 16,
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
