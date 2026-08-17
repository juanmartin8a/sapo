import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import Purchases, { type CustomerInfo } from "react-native-purchases";

import { api } from "@/convex/_generated/api";
import {
    configureRevenueCat,
    hasActiveRevenueCatSubscription,
    hasRevenueCatConfig,
    isReceiptAlreadyInUseRevenueCatError,
    isRevenueCatSupportedPlatform,
    logOutRevenueCatIdentity,
} from "@/lib/revenuecat";
import { reconcileObservedSubscriptionState } from "@/lib/subscription-reconciliation";
import { useAuthState } from "@/providers/AuthStateProvider";
import useSubscriptionStatusStore from "@/stores/subscriptionStatusStore";

const identitySyncRetryDelaysMs = [1_000, 2_000, 4_000] as const;

export default function RevenueCatIdentitySync() {
    const { status: authStatus, userId } = useAuthState();
    const serverSubscription = useQuery(
        api.subscription.getCurrentSubscriptionStatus,
        authStatus === "authenticated" && userId
            ? { expected_user_id: userId }
            : "skip"
    );
    const setCurrentSubscriptionUser = useSubscriptionStatusStore((state) => state.setCurrentUser);
    const setSubscriptionForUser = useSubscriptionStatusStore((state) => state.setForUser);
    const receiptConflictUserIdRef = useRef<string | null>(null);
    const syncedRevenueCatUserIdRef = useRef<string | null>(null);
    const lastRevenueCatActiveRef = useRef<boolean | null>(null);
    const revenueCatLogoutPromiseRef = useRef<Promise<unknown> | null>(null);

    useEffect(() => {
        if (authStatus !== "checking") {
            setCurrentSubscriptionUser(userId);
        }
    }, [authStatus, setCurrentSubscriptionUser, userId]);

    useEffect(() => {
        if (
            !userId ||
            serverSubscription === undefined ||
            (serverSubscription !== null && serverSubscription.user_id !== userId)
        ) {
            return;
        }

        setSubscriptionForUser(userId, serverSubscription?.status ?? "inactive");
    }, [serverSubscription, setSubscriptionForUser, userId]);

    useEffect(() => {
        if (authStatus === "checking") {
            return;
        }

        if (!userId) {
            const previousRevenueCatUserId = syncedRevenueCatUserIdRef.current;

            receiptConflictUserIdRef.current = null;
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

        if (!isRevenueCatSupportedPlatform || !hasRevenueCatConfig()) {
            return;
        }

        let isCancelled = false;
        let isCustomerInfoListenerAttached = false;
        let cancelRetryDelay: (() => void) | null = null;

        const waitForRetry = (delayMs: number) => new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
                cancelRetryDelay = null;
                resolve();
            }, delayMs);

            cancelRetryDelay = () => {
                clearTimeout(timeout);
                cancelRetryDelay = null;
                resolve();
            };
        });

        const reconcileCustomerInfo = async (customerInfo: CustomerInfo, isStartup = false) => {
            if (isCancelled || receiptConflictUserIdRef.current === userId) {
                return;
            }

            const currentAppUserId = await Purchases.getAppUserID();
            if (isCancelled || currentAppUserId !== userId) {
                return;
            }

            const observedActive = hasActiveRevenueCatSubscription(customerInfo);
            if (!isStartup && lastRevenueCatActiveRef.current === observedActive) {
                return;
            }

            await reconcileObservedSubscriptionState({ userId, observedActive });

            if (!isCancelled) {
                lastRevenueCatActiveRef.current = observedActive;
            }
        };

        const handleCustomerInfoUpdate = (customerInfo: CustomerInfo) => {
            void reconcileCustomerInfo(customerInfo).catch((error) => {
                if (__DEV__) {
                    console.warn("RevenueCat subscription reconciliation failed", error);
                }
            });
        };

        const syncRevenueCatIdentity = async () => {
            await revenueCatLogoutPromiseRef.current;

            for (let attempt = 0; !isCancelled; attempt += 1) {
                try {
                    const isConfigured = await configureRevenueCat(userId);
                    if (!isConfigured || isCancelled) return;

                    const currentAppUserId = await Purchases.getAppUserID();
                    const customerInfo = currentAppUserId === userId
                        ? await Purchases.getCustomerInfo()
                        : (await Purchases.logIn(userId)).customerInfo;
                    const confirmedAppUserId = await Purchases.getAppUserID();

                    if (isCancelled || confirmedAppUserId !== userId) {
                        return;
                    }

                    receiptConflictUserIdRef.current = null;
                    syncedRevenueCatUserIdRef.current = userId;
                    lastRevenueCatActiveRef.current = null;

                    Purchases.addCustomerInfoUpdateListener(handleCustomerInfoUpdate);
                    isCustomerInfoListenerAttached = true;

                    void reconcileCustomerInfo(customerInfo, true).catch((error) => {
                        if (__DEV__) {
                            console.warn("RevenueCat subscription reconciliation failed", error);
                        }
                    });
                    return;
                } catch (error) {
                    if (isCancelled) return;

                    if (isReceiptAlreadyInUseRevenueCatError(error)) {
                        receiptConflictUserIdRef.current = userId;
                        lastRevenueCatActiveRef.current = false;
                        return;
                    }

                    const retryDelayMs = identitySyncRetryDelaysMs[attempt];
                    if (typeof retryDelayMs !== "number") {
                        if (__DEV__) {
                            console.warn("RevenueCat identity sync failed after retries", error);
                        }
                        return;
                    }

                    await waitForRetry(retryDelayMs);
                }
            }
        };

        void syncRevenueCatIdentity();

        return () => {
            isCancelled = true;
            cancelRetryDelay?.();

            if (isCustomerInfoListenerAttached) {
                Purchases.removeCustomerInfoUpdateListener(handleCustomerInfoUpdate);
            }
        };
    }, [authStatus, setSubscriptionForUser, userId]);

    return null;
}
