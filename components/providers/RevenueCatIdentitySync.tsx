import { useCallback, useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { AppState } from "react-native";
import Purchases, { type CustomerInfo } from "react-native-purchases";

import { authClient } from "@/clients/auth-client";
import {
    configureRevenueCat,
    hasActiveRevenueCatSubscription,
    hasRevenueCatConfig,
    isReceiptAlreadyInUseRevenueCatError,
    isRevenueCatSupportedPlatform,
    logOutRevenueCatIdentity,
} from "@/clients/revenuecat";
import {
    refreshSubscriptionState,
    refreshSubscriptionStateAfterRevenueCatUpdate,
} from "@/clients/subscription-refresh";
import { api } from "@/convex/_generated/api";
import useSubscriptionStatusStore from "@/stores/subscriptionStatusStore";

export default function RevenueCatIdentitySync() {
    const { data: session, isPending, refetch } = authClient.useSession();
    const currentUser = useQuery(api.auth.getCurrentUser, session ? {} : "skip");
    const isCheckingCurrentUser = Boolean(session) && currentUser === undefined;
    const isAuthPending = isPending || isCheckingCurrentUser;
    const userId = currentUser ? session?.user?.id ?? null : null;
    const setHasActiveSubscription = useSubscriptionStatusStore(
        (state) => state.setHasActiveSubscription
    );
    const receiptConflictUserIdRef = useRef<string | null>(null);
    const authenticatedSessionUserIdRef = useRef<string | null>(null);
    const syncedRevenueCatUserIdRef = useRef<string | null>(null);
    const lastRevenueCatActiveRef = useRef<boolean | null>(null);

    const fallbackSubscriptionStatusOnError = useCallback(() => {
        if (useSubscriptionStatusStore.getState().hasActiveSubscription === null) {
            setHasActiveSubscription(false);
        }
    }, [setHasActiveSubscription]);

    useEffect(() => {
        if (!isRevenueCatSupportedPlatform || !hasRevenueCatConfig()) {
            setHasActiveSubscription(false);
            return;
        }

        const appStateSubscription = AppState.addEventListener("change", (nextState) => {
            if (nextState === "active") {
                void refetch().catch((error) => {
                    if (__DEV__) {
                        console.warn("Session refresh failed", error);
                    }
                });
            }
        });

        void refetch().catch((error) => {
            if (__DEV__) {
                console.warn("Session refresh failed", error);
            }
        });

        return () => {
            appStateSubscription.remove();
        };
    }, [refetch, setHasActiveSubscription]);

    useEffect(() => {
        if (isAuthPending) {
            return;
        }

        if (!isRevenueCatSupportedPlatform || !hasRevenueCatConfig()) {
            setHasActiveSubscription(false);
            return;
        }

        if (!userId) {
            setHasActiveSubscription(false);
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
                setHasActiveSubscription(false);
                return;
            }

            const hasActiveSubscription = hasActiveRevenueCatSubscription(customerInfo);

            void (async () => {
                const currentAppUserId = await Purchases.getAppUserID();

                if (isCancelled || currentAppUserId !== userId) {
                    return;
                }

                const previousHasActiveSubscription = lastRevenueCatActiveRef.current;
                const previousStoredHasActiveSubscription =
                    useSubscriptionStatusStore.getState().hasActiveSubscription;
                const shouldRefreshServerState = previousHasActiveSubscription === null
                    ? hasActiveSubscription || previousStoredHasActiveSubscription === true
                    : previousHasActiveSubscription !== hasActiveSubscription;

                lastRevenueCatActiveRef.current = hasActiveSubscription;
                setHasActiveSubscription(hasActiveSubscription);

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
                        setHasActiveSubscription(false);
                    }

                    return;
                }

                Purchases.addCustomerInfoUpdateListener(handleCustomerInfoUpdate);
                isCustomerInfoListenerAttached = true;
            } catch (error) {
                if (__DEV__) {
                    console.warn("RevenueCat customer info setup failed", error);
                }

                if (!isCancelled) {
                    fallbackSubscriptionStatusOnError();
                }
            }
        };

        void initializeCustomerInfoListener();

        return () => {
            isCancelled = true;

            if (isCustomerInfoListenerAttached) {
                Purchases.removeCustomerInfoUpdateListener(handleCustomerInfoUpdate);
            }
        };
    }, [fallbackSubscriptionStatusOnError, isAuthPending, setHasActiveSubscription, userId]);

    useEffect(() => {
        if (isAuthPending) {
            return;
        }

        if (!isRevenueCatSupportedPlatform || !hasRevenueCatConfig()) {
            setHasActiveSubscription(false);
            return;
        }

        if (!userId) {
            const previousRevenueCatUserId =
                syncedRevenueCatUserIdRef.current ?? authenticatedSessionUserIdRef.current;

            receiptConflictUserIdRef.current = null;
            authenticatedSessionUserIdRef.current = null;
            syncedRevenueCatUserIdRef.current = null;
            lastRevenueCatActiveRef.current = null;
            setHasActiveSubscription(false);

            if (previousRevenueCatUserId) {
                void logOutRevenueCatIdentity(previousRevenueCatUserId).catch((error) => {
                    if (__DEV__) {
                        console.warn("RevenueCat identity logout failed", error);
                    }
                });
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
                if (receiptConflictUserIdRef.current === userId) {
                    if (!isCancelled) {
                        setHasActiveSubscription(false);
                    }

                    return;
                }

                const isConfigured = await configureRevenueCat(userId);

                if (!isConfigured || isCancelled) {
                    if (!isConfigured && !isCancelled) {
                        setHasActiveSubscription(false);
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
                    const previousStoredHasActiveSubscription =
                        useSubscriptionStatusStore.getState().hasActiveSubscription;

                    lastRevenueCatActiveRef.current = hasActiveSubscription;
                    setHasActiveSubscription(hasActiveSubscription);

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
                    setHasActiveSubscription(false);
                    return;
                }

                if (__DEV__) {
                    console.warn("RevenueCat identity sync failed", error);
                }

                if (!isCancelled) {
                    fallbackSubscriptionStatusOnError();
                }
            }
        };

        void syncRevenueCatIdentity();

        return () => {
            isCancelled = true;
        };
    }, [fallbackSubscriptionStatusOnError, isAuthPending, setHasActiveSubscription, userId]);

    return null;
}
