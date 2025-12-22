import { authClient } from '@/clients/auth-client';
import { HomeBottomSheetKey } from '@/types/bottomSheets';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, TouchableOpacity, Text, View } from 'react-native';
import LogInIcon from '@/assets/icons/log-in.svg';

type SideBarFooterProps = {
    requestBottomSheet: (sheet: HomeBottomSheetKey) => void
}

const SideBarFooter = ({ requestBottomSheet }: SideBarFooterProps) => {
    const router = useRouter();
    const { data: session } = authClient.useSession()
    const user = session?.user;
    const email = user?.email ?? "";
    const emailInitial = user?.email.charAt(0).toUpperCase();
    const isSignedIn = !!user;

    const handleSignInPress = useCallback(() => {
        router.push('/auth');
    }, [router]);

    return (
        <View style={styles.footer}>
            {isSignedIn ? (
                <View style={styles.userActionsContainer}>
                    <TouchableOpacity
                        onPress={() => requestBottomSheet('account_tap')}
                        activeOpacity={0.7}
                        style={styles.userContainer}
                    >
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{emailInitial}</Text>
                        </View>
                        <View style={styles.userTextContainer}>
                            <Text style={styles.emailText} numberOfLines={1}>
                                {email}
                            </Text>
                            <Text style={styles.planText}>Free</Text>
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
        marginTop: 4,
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

export default SideBarFooter;
