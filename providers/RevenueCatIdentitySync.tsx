import { useCallback, useEffect, useRef } from "react";
import Purchases, { type CustomerInfo } from "react-native-purchases";

import {
    configureRevenueCat,
    hasActiveRevenueCatSubscription,
    hasRevenueCatConfig,
    isReceiptAlreadyInUseRevenueCatError,
    isRevenueCatSupportedPlatform,
    logOutRevenueCatIdentity,
} from "@/lib/revenuecat";
import {
    refreshSubscriptionState,
    refreshSubscriptionStateAfterRevenueCatUpdate,
} from "@/lib/subscription-refresh";
import { useAuthState } from "@/providers/AuthStateProvider";
import useSubscriptionStatusStore from "@/stores/subscriptionStatusStore";

export default function RevenueCatIdentitySync() {
    const { status, userId } = useAuthState();
    const isAuthPending = status === "checking";
    const setCurrentSubscriptionUser = useSubscriptionStatusStore((state) => state.setCurrentUser);
    const setSubscriptionForUser = useSubscriptionStatusStore((state) => state.setForUser);
    const receiptConflictUserIdRef = useRef<string | null>(null);
    const authenticatedSessionUserIdRef = useRef<string | null>(null);
    const syncedRevenueCatUserIdRef = useRef<string | null>(null);
    const lastRevenueCatActiveRef = useRef<boolean | null>(null);
    const revenueCatLogoutPromiseRef = useRef<Promise<unknown> | null>(null);

    const publishSubscriptionStatus = useCallback((hasActiveSubscription: boolean | null) => {
        return userId ? setSubscriptionForUser(userId, hasActiveSubscription) : false;
    }, [setSubscriptionForUser, userId]);

    useEffect(() => {
        if (!isAuthPending) {
            setCurrentSubscriptionUser(userId);
        }
    }, [isAuthPending, setCurrentSubscriptionUser, userId]);

    useEffect(() => {
        if (isAuthPending) {
            return;
        }

        if (!isRevenueCatSupportedPlatform || !hasRevenueCatConfig()) {
            publishSubscriptionStatus(false);
            return;
        }

        if (!userId) {
            return;
        }

        let isCancelled = false;
        let isCustomerInfoListenerAttached = false;

        const handleCustomerInfoUpdate = (customerInfo: CustomerInfo) => {
            if (isCancelled) {
                return;
            }

            if (receiptConflictUserIdRef.current === userId) {
                lastRevenueCatActiveRef.current = false;
                publishSubscriptionStatus(false);
                return;
            }

            const hasActiveSubscription = hasActiveRevenueCatSubscription(customerInfo);

            void (async () => {
                const currentAppUserId = await Purchases.getAppUserID();

                if (isCancelled || currentAppUserId !== userId) {
                    return;
                }

                const previousHasActiveSubscription = lastRevenueCatActiveRef.current;
                const subscriptionState = useSubscriptionStatusStore.getState();
                const previousStoredHasActiveSubscription = subscriptionState.userId === userId
                    ? subscriptionState.hasActiveSubscription
                    : null;
                const shouldRefreshServerState = previousHasActiveSubscription === null
                    ? hasActiveSubscription || previousStoredHasActiveSubscription === true
                    : previousHasActiveSubscription !== hasActiveSubscription;

                lastRevenueCatActiveRef.current = hasActiveSubscription;
                publishSubscriptionStatus(hasActiveSubscription);

                if (!shouldRefreshServerState) {
                    return;
                }

                if (hasActiveSubscription) {
                    await refreshSubscriptionStateAfterRevenueCatUpdate(userId);
                    return;
                }

                await refreshSubscriptionState({ userId });
            })().catch((error) => {
                if (__DEV__) {
                    console.warn("RevenueCat listener subscription sync failed", error);
                }
            });
        };

        const initializeCustomerInfoListener = async () => {
            try {
                const isConfigured = await configureRevenueCat(userId);

                if (!isConfigured || isCancelled) {
                    if (!isConfigured && !isCancelled) {
                        publishSubscriptionStatus(false);
                    }

                    return;
                }

                Purchases.addCustomerInfoUpdateListener(handleCustomerInfoUpdate);
                isCustomerInfoListenerAttached = true;
            } catch (error) {
                if (__DEV__) {
                    console.warn("RevenueCat customer info setup failed", error);
                }

                // Preserve an existing status; a transient setup error does not prove inactivity.
            }
        };

        void initializeCustomerInfoListener();

        return () => {
            isCancelled = true;

            if (isCustomerInfoListenerAttached) {
                Purchases.removeCustomerInfoUpdateListener(handleCustomerInfoUpdate);
            }
        };
    }, [isAuthPending, publishSubscriptionStatus, userId]);

    useEffect(() => {
        if (isAuthPending) {
            return;
        }

        if (!isRevenueCatSupportedPlatform || !hasRevenueCatConfig()) {
            publishSubscriptionStatus(false);
            return;
        }

        if (!userId) {
            const previousRevenueCatUserId =
                syncedRevenueCatUserIdRef.current ?? authenticatedSessionUserIdRef.current;

            receiptConflictUserIdRef.current = null;
            authenticatedSessionUserIdRef.current = null;
            syncedRevenueCatUserIdRef.current = null;
            lastRevenueCatActiveRef.current = null;

            if (previousRevenueCatUserId) {
                const previousLogoutPromise = revenueCatLogoutPromiseRef.current;
                const logoutPromise = (previousLogoutPromise ?? Promise.resolve())
                    .then(() => logOutRevenueCatIdentity(previousRevenueCatUserId))
                    .catch((error) => {
                        if (__DEV__) {
                            console.warn("RevenueCat identity logout failed", error);
                        }
                    })
                    .finally(() => {
                        if (revenueCatLogoutPromiseRef.current === logoutPromise) {
                            revenueCatLogoutPromiseRef.current = null;
                        }
                    });
                revenueCatLogoutPromiseRef.current = logoutPromise;
            }

            return;
        }

        if (authenticatedSessionUserIdRef.current !== userId) {
            lastRevenueCatActiveRef.current = null;
        }

        authenticatedSessionUserIdRef.current = userId;

        let isCancelled = false;

        const syncRevenueCatIdentity = async () => {
            try {
                await revenueCatLogoutPromiseRef.current;

                if (isCancelled) {
                    return;
                }

                if (receiptConflictUserIdRef.current === userId) {
                    if (!isCancelled) {
                        publishSubscriptionStatus(false);
                    }

                    return;
                }

                const isConfigured = await configureRevenueCat(userId);

                if (!isConfigured || isCancelled) {
                    if (!isConfigured && !isCancelled) {
                        publishSubscriptionStatus(false);
                    }

                    return;
                }

                const currentAppUserId = await Purchases.getAppUserID();

                let customerInfo: CustomerInfo;

                if (currentAppUserId !== userId) {
                    customerInfo = (await Purchases.logIn(userId)).customerInfo;
                } else {
                    customerInfo = await Purchases.getCustomerInfo();
                }

                if (!isCancelled) {
                    receiptConflictUserIdRef.current = null;
                    syncedRevenueCatUserIdRef.current = userId;
                    const hasActiveSubscription = hasActiveRevenueCatSubscription(customerInfo);
                    const subscriptionState = useSubscriptionStatusStore.getState();
                    const previousStoredHasActiveSubscription = subscriptionState.userId === userId
                        ? subscriptionState.hasActiveSubscription
                        : null;

                    lastRevenueCatActiveRef.current = hasActiveSubscription;
                    publishSubscriptionStatus(hasActiveSubscription);

                    if (hasActiveSubscription) {
                        void refreshSubscriptionStateAfterRevenueCatUpdate(userId).catch((error) => {
                            if (__DEV__) {
                                console.warn("RevenueCat active subscription sync failed", error);
                            }
                        });
                    } else if (previousStoredHasActiveSubscription === true) {
                        void refreshSubscriptionState({ userId }).catch((error) => {
                            if (__DEV__) {
                                console.warn("RevenueCat inactive subscription sync failed", error);
                            }
                        });
                    }
                }
            } catch (error) {
                if (!isCancelled && isReceiptAlreadyInUseRevenueCatError(error)) {
                    receiptConflictUserIdRef.current = userId;
                    lastRevenueCatActiveRef.current = false;
                    publishSubscriptionStatus(false);
                    return;
                }

                if (__DEV__) {
                    console.warn("RevenueCat identity sync failed", error);
                }

                // Preserve an existing status; a transient sync error does not prove inactivity.
            }
        };

        void syncRevenueCatIdentity();

        return () => {
            isCancelled = true;
        };
    }, [isAuthPending, publishSubscriptionStatus, userId]);

    return null;
}
