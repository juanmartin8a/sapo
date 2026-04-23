import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import Purchases, { type CustomerInfo } from "react-native-purchases";

import { authClient } from "@/clients/auth-client";
import {
    configureRevenueCat,
    hasActiveRevenueCatSubscription,
    hasRevenueCatConfig,
    isReceiptAlreadyInUseRevenueCatError,
    isRevenueCatSupportedPlatform,
} from "@/clients/revenuecat";
import useSubscriptionStatusStore from "@/stores/subscriptionStatusStore";
import { isAnonymousSessionUser } from "@/utils/auth";

export default function RevenueCatIdentitySync() {
    const { data: session, isPending, refetch } = authClient.useSession();
    const user = session?.user;
    const isAnonymousUser = isAnonymousSessionUser(user);
    const userId = !isAnonymousUser ? user?.id ?? null : null;
    const setHasActiveSubscription = useSubscriptionStatusStore(
        (state) => state.setHasActiveSubscription
    );
    const receiptConflictUserIdRef = useRef<string | null>(null);

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
        if (isPending) {
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
                setHasActiveSubscription(false);
                return;
            }

            setHasActiveSubscription(hasActiveRevenueCatSubscription(customerInfo));
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
    }, [fallbackSubscriptionStatusOnError, isPending, setHasActiveSubscription, userId]);

    useEffect(() => {
        if (isPending) {
            return;
        }

        if (!isRevenueCatSupportedPlatform || !hasRevenueCatConfig()) {
            setHasActiveSubscription(false);
            return;
        }

        if (!userId) {
            receiptConflictUserIdRef.current = null;
            setHasActiveSubscription(false);
            return;
        }

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
                    setHasActiveSubscription(hasActiveRevenueCatSubscription(customerInfo));
                }
            } catch (error) {
                if (!isCancelled && isReceiptAlreadyInUseRevenueCatError(error)) {
                    receiptConflictUserIdRef.current = userId;
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
    }, [fallbackSubscriptionStatusOnError, isPending, setHasActiveSubscription, userId]);

    useEffect(() => {
        if (isPending || userId) {
            return;
        }

        if (!isRevenueCatSupportedPlatform || !hasRevenueCatConfig()) {
            return;
        }

        let isCancelled = false;

        const logOutRevenueCatIdentity = async () => {
            try {
                if (!(await Purchases.isConfigured())) {
                    return;
                }

                await Purchases.logOut();
            } catch (error) {
                if (__DEV__ && !isCancelled) {
                    console.warn("RevenueCat logout failed", error);
                }
            }
        };

        void logOutRevenueCatIdentity();

        return () => {
            isCancelled = true;
        };
    }, [isPending, userId]);

    return null;
}
