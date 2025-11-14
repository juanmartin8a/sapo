import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BottomSheet from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';

import LogOutIcon from '@/assets/icons/log-out.svg';
import SettingsIcon from '@/assets/icons/settings.svg';
import useHomeBottomSheetNotifier from '@/stores/homeBottomSheetNotifierStore';

const AccountTapBottomSheet = () => {
    const sheetRef = useRef<BottomSheet>(null);
    const snapPoints = useMemo(() => ['30%'], []);
    const insets = useSafeAreaInsets();
    const { signOut, isLoaded: isAuthLoaded } = useAuth();
    const [isProcessing, setIsProcessing] = useState(false);
    const router = useRouter();
    // const bottomSheet = useHomeBottomSheetNotifier((state) => state.bottomSheet);
    // const isActive = bottomSheet === 'account_tap';

    useEffect(() => {
        const unsub = useHomeBottomSheetNotifier.subscribe((state) => {
            if (
                state.bottomSheet === 'account_tap' &&
                state.bottomSheetToOpen !== 'account_tap' &&
                state.loading === true
            ) {
                sheetRef.current?.close();
            }
            if (
                (state.bottomSheet === 'account_tap' || state.bottomSheet === undefined) &&
                state.bottomSheetToOpen === 'account_tap' &&
                state.loading === true
            ) {
                sheetRef.current?.expand();
            }
        })

        return () => unsub();
    }, []);

    const handleSheetClose = useCallback(() => {
        const { bottomSheet, bottomSheetToOpen, loading } = useHomeBottomSheetNotifier.getState();
        if (
            bottomSheet === 'account_tap' &&
            bottomSheetToOpen !== 'account_tap' &&
            loading === true
        ) {
            if (bottomSheetToOpen === undefined) {
                return;
            }

            useHomeBottomSheetNotifier.getState().bottomSheetClosed()
        }
    }, []);

    const handleSheetChange = useCallback((index: number) => {
        if (index > -1) {
            const { bottomSheet, bottomSheetToOpen, loading } = useHomeBottomSheetNotifier.getState();
            if (
                (bottomSheet === 'account_tap' || bottomSheet === undefined) &&
                bottomSheetToOpen === 'account_tap' &&
                loading === true
            ) {
                useHomeBottomSheetNotifier.getState().bottomSheetOpened()
            }
            return;
        }

        // handleSheetClose();
    }, []);

    const handleNavigateToSettings = useCallback(() => {
        sheetRef.current?.close();
        handleSheetClose();
        router.push('/settings');
    }, [router, handleSheetClose]);

    const handleSignOut = useCallback(async () => {
        if (!isAuthLoaded || isProcessing) {
            return;
        }

        try {
            setIsProcessing(true);
            await signOut();
            sheetRef.current?.close();
            handleSheetClose();
        } catch {
            Alert.alert('Something went wrong', 'Unable to sign out. Please try again.');
        } finally {
            setIsProcessing(false);
        }
    }, [isAuthLoaded, isProcessing, signOut, handleSheetClose]);

    return (
        <BottomSheet
            ref={sheetRef}
            index={-1}
            snapPoints={snapPoints}
            enableDynamicSizing={false}
            enablePanDownToClose
            handleIndicatorStyle={styles.handleIndicator}
            style={styles.bottomSheet}
            backgroundStyle={styles.bottomSheetBackground}
            onClose={handleSheetClose}
            onChange={handleSheetChange}
        >
            <View style={[styles.contentContainer, { paddingBottom: insets.bottom + 24 }]}>
                <TouchableOpacity
                    style={styles.listItem}
                    onPress={handleNavigateToSettings}
                    activeOpacity={0.65}
                >
                    <View style={styles.listItemContent}>
                        <SettingsIcon width={20} height={20} stroke="#fff" style={styles.icon} />
                        <Text style={styles.listItemText}>Settings</Text>
                    </View>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.listItem, (!isAuthLoaded || isProcessing) && styles.listItemDisabled]}
                    onPress={handleSignOut}
                    activeOpacity={0.65}
                    disabled={!isAuthLoaded || isProcessing}
                >
                    <View style={styles.listItemContent}>
                        <LogOutIcon width={20} height={20} stroke="#fff" style={styles.icon} />
                        <Text style={styles.listItemText}>Sign out</Text>
                    </View>
                    {isProcessing && <ActivityIndicator color="#fff" size="small" />}
                </TouchableOpacity>
            </View>
        </BottomSheet>
    );
};

const styles = StyleSheet.create({
    bottomSheet: {
        shadowColor: '#aaa',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
    },
    bottomSheetBackground: {
        backgroundColor: 'black',
        borderTopLeftRadius: 15,
        borderTopRightRadius: 15,
    },
    handleIndicator: {
        backgroundColor: 'white',
        width: 25,
        height: 5,
        borderRadius: 20,
    },
    contentContainer: {
        paddingHorizontal: 24,
        paddingTop: 16,
    },
    listItem: {
        width: '100%',
        borderWidth: 1,
        borderColor: 'white',
        borderRadius: 8,
        paddingVertical: 18,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    listItemContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    listItemText: {
        fontSize: 16,
        color: 'white',
        fontWeight: '600',
    },
    listItemDisabled: {
        opacity: 0.5,
    },
    icon: {
        marginRight: 4,
    },
});

export default AccountTapBottomSheet;
