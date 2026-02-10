import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BottomSheet from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import LogOutIcon from '@/assets/icons/log-out.svg';
import SettingsIcon from '@/assets/icons/settings.svg';
import useHomeBottomSheetNotifier from '@/stores/homeBottomSheetNotifierStore';
import { useSidebarIsOpenNotifier } from '@/stores';
import { authClient } from '@/clients/auth-client';

const AccountTapBottomSheet = () => {
    const sheetRef = useRef<BottomSheet>(null);
    const snapPoints = useMemo(() => ['25%'], []);
    const insets = useSafeAreaInsets();
    const { isPending } = authClient.useSession();
    const [isProcessing, setIsProcessing] = useState(false);
    const router = useRouter();
    const isClosed = useRef<boolean>(true);

    const initSnapSuccess = useRef<boolean>(false); // helps track a possible cancel before the bottom sheet opens at at least snap index 0

    const sidebarIsOpen = useSidebarIsOpenNotifier(state => state.isOpen);

    useEffect(() => {
        const unsub = useHomeBottomSheetNotifier.subscribe((state) => {
            if (
                state.bottomSheet === 'account_tap' &&
                state.bottomSheetToOpen !== 'account_tap' &&
                state.loading === true
            ) {
                sheetRef.current?.close();
            } else if (
                (state.bottomSheet === 'account_tap' || state.bottomSheet === undefined) &&
                state.bottomSheetToOpen === 'account_tap' &&
                state.loading === true
            ) {
                sheetRef.current?.expand();
            }
        })

        return () => unsub();
    }, []);

    // Close the bottom sheet when sidebar is closed
    useEffect(() => {
        if (!sidebarIsOpen && !isClosed.current) {
            sheetRef.current?.close();
        }
    }, [sidebarIsOpen]);

    const handleSheetClose = useCallback(() => {
        isClosed.current = true;

        if (!initSnapSuccess.current) {
            useHomeBottomSheetNotifier.getState().bottomSheetClosed(true);
            return;
        }

        initSnapSuccess.current = false;

        const { bottomSheet, bottomSheetToOpen } = useHomeBottomSheetNotifier.getState();
        if (
            bottomSheet === 'account_tap' &&
            bottomSheetToOpen !== 'account_tap'
        ) {

            useHomeBottomSheetNotifier.getState().bottomSheetClosed()
        }
    }, []);

    const handleSheetChange = useCallback((index: number) => {
        if (index > -1) {
            isClosed.current = false;

            initSnapSuccess.current = true;

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

    }, []);

    const handleNavigateToSettings = useCallback(() => {
        sheetRef.current?.close();
        handleSheetClose();
        router.push('/settings');
    }, [router, handleSheetClose]);

    const handleSignOut = useCallback(async () => {
        if (isPending || isProcessing) {
            return;
        }

        try {
            setIsProcessing(true);
            await authClient.signOut();
            sheetRef.current?.close();
            handleSheetClose();
        } catch {
            Alert.alert('Something went wrong', 'Unable to sign out. Please try again.');
        } finally {
            setIsProcessing(false);
        }
    }, [isPending, isProcessing, handleSheetClose]);

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
                    activeOpacity={0.85}
                >
                    <View style={styles.listItemContent}>
                        <SettingsIcon width={20} height={20} stroke="#000" style={styles.icon} />
                        <Text style={styles.listItemText}>Settings</Text>
                    </View>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[(isPending || isProcessing) && styles.listItemDisabled]}
                    onPress={handleSignOut}
                    activeOpacity={0.85}
                    disabled={isPending || isProcessing}
                >
                    <View style={styles.signOutContent}>
                        <LogOutIcon width={20} height={20} stroke="#fff" style={styles.icon} />
                        <Text style={styles.signOutText}>Sign out</Text>
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
        paddingTop: 12,
    },
    listItem: {
        width: '100%',
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        color: "black",
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    listItemContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    listItemText: {
        fontSize: 15,
        color: '#000',
        fontWeight: '500',
    },
    signOutContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 12
    },
    signOutText: {
        fontSize: 15,
        color: '#fff',
        fontWeight: '500',
    },
    listItemDisabled: {
        opacity: 0.5,
    },
    icon: {
        marginRight: 12,
    },
});

export default AccountTapBottomSheet;
