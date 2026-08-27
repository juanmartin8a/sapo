import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { AppState } from "react-native";
import Purchases, { type CustomerInfo } from "react-native-purchases";

import { api } from "@/convex/_generated/api";
import {
    getRevenueCatAccessExpirationAtMs,
    getRevenueCatSubscriptionFingerprint,
    hasActiveRevenueCatSubscription,
    hasRevenueCatConfig,
    isReceiptAlreadyInUseRevenueCatError,
    isRevenueCatSupportedPlatform,
    logOutRevenueCatIdentity,
    runRevenueCatOperationForUser,
    setDesiredRevenueCatAppUserId,
} from "@/lib/revenuecat";
import { reconcileObservedSubscriptionState } from "@/lib/subscription-reconciliation";
import { useAuthState } from "@/providers/AuthStateProvider";
import useRevenueCatOfferingStore from "@/stores/revenueCatOfferingStore";
import useSubscriptionStatusStore from "@/stores/subscriptionStatusStore";

const identitySyncRetryDelaysMs = [1_000, 2_000, 4_000] as const;
const maximumExpirationTimerDelayMs = 2_000_000_000;

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
    const clearRevenueCatOffering = useRevenueCatOfferingStore((state) => state.clear);
    const loadRevenueCatOffering = useRevenueCatOfferingStore((state) => state.loadForUser);
    const setLinkedElsewhereUser = useRevenueCatOfferingStore(
        (state) => state.setLinkedElsewhereUser
    );
    const identitySyncRequestId = useRevenueCatOfferingStore(
        (state) => state.identitySyncRequestId
    );
    const receiptConflictUserIdRef = useRef<string | null>(null);
    const syncedRevenueCatUserIdRef = useRef<string | null>(null);
    const lastObservedRevenueCatFingerprintRef = useRef<string | null>(null);
    const lastReconciledRevenueCatFingerprintRef = useRef<string | null>(null);
    const revenueCatObservationVersionRef = useRef(0);
    const revenueCatLogoutPromiseRef = useRef<Promise<unknown> | null>(null);

    useEffect(() => {
        if (authStatus !== "checking") {
            setCurrentSubscriptionUser(userId);
        }
    }, [authStatus, setCurrentSubscriptionUser, userId]);

    useEffect(() => {
        if (
            !userId ||
            serverSubscription == null ||
            serverSubscription.user_id !== userId
        ) {
            return;
        }

        setSubscriptionForUser(userId, serverSubscription.status);
    }, [serverSubscription, setSubscriptionForUser, userId]);

    useEffect(() => {
        if (authStatus === "checking") {
            return;
        }

        setDesiredRevenueCatAppUserId(userId);

        if (!isRevenueCatSupportedPlatform || !hasRevenueCatConfig()) {
            clearRevenueCatOffering();
            return;
        }

        if (!userId) {
            clearRevenueCatOffering();
            const previousRevenueCatUserId = syncedRevenueCatUserIdRef.current;

            receiptConflictUserIdRef.current = null;
            syncedRevenueCatUserIdRef.current = null;
            lastObservedRevenueCatFingerprintRef.current = null;
            lastReconciledRevenueCatFingerprintRef.current = null;
            revenueCatObservationVersionRef.current += 1;

            const previousLogoutPromise = revenueCatLogoutPromiseRef.current;
            const logoutPromise = (previousLogoutPromise ?? Promise.resolve())
                .then(() => logOutRevenueCatIdentity(previousRevenueCatUserId))
                .then(() => loadRevenueCatOffering(null))
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

            return;
        }

        let isCancelled = false;
        let isCustomerInfoListenerAttached = false;
        let expirationRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
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

        const clearExpirationRefresh = () => {
            if (expirationRefreshTimeout !== null) {
                clearTimeout(expirationRefreshTimeout);
                expirationRefreshTimeout = null;
            }
        };

        const scheduleExpirationRefresh = (customerInfo: CustomerInfo) => {
            clearExpirationRefresh();
            const expirationAtMs = getRevenueCatAccessExpirationAtMs(customerInfo);

            if (expirationAtMs === null) {
                return;
            }

            const remainingMs = expirationAtMs - Date.now();
            const delayMs = Math.min(
                Math.max(remainingMs + 250, 0),
                maximumExpirationTimerDelayMs
            );
            expirationRefreshTimeout = setTimeout(() => {
                expirationRefreshTimeout = null;
                void refreshCustomerInfo(customerInfo).catch((error) => {
                    if (__DEV__) {
                        console.warn("RevenueCat expiration refresh failed", error);
                    }
                });
            }, delayMs);
        };

        const reconcileCustomerInfo = async (customerInfo: CustomerInfo, force = false) => {
            if (isCancelled || receiptConflictUserIdRef.current === userId) {
                return;
            }

            const currentAppUserId = await Purchases.getAppUserID();
            if (isCancelled || currentAppUserId !== userId) {
                return;
            }

            const observedActive = hasActiveRevenueCatSubscription(customerInfo);
            const fingerprint = getRevenueCatSubscriptionFingerprint(customerInfo);
            const isNewObservation =
                lastObservedRevenueCatFingerprintRef.current !== fingerprint;

            if (isNewObservation) {
                lastObservedRevenueCatFingerprintRef.current = fingerprint;
                revenueCatObservationVersionRef.current += 1;
            }

            const observationVersion = revenueCatObservationVersionRef.current;
            scheduleExpirationRefresh(customerInfo);

            if (
                !force &&
                !isNewObservation &&
                lastReconciledRevenueCatFingerprintRef.current === fingerprint
            ) {
                return;
            }

            const result = await reconcileObservedSubscriptionState({
                userId,
                observedActive,
                observationKey: fingerprint,
            });

            if (
                !isCancelled &&
                revenueCatObservationVersionRef.current === observationVersion
            ) {
                lastReconciledRevenueCatFingerprintRef.current = fingerprint;

                if (result.status !== "reconciling") {
                    setSubscriptionForUser(userId, result.status);
                }
            }
        };

        const refreshCustomerInfo = async (fallbackCustomerInfo?: CustomerInfo) => {
            let customerInfo: CustomerInfo | null;

            try {
                customerInfo = await runRevenueCatOperationForUser(
                    userId,
                    async () => {
                        await Purchases.invalidateCustomerInfoCache();
                        return Purchases.getCustomerInfo();
                    },
                    () => !isCancelled
                );
            } catch (error) {
                if (fallbackCustomerInfo && !isCancelled) {
                    await reconcileCustomerInfo(fallbackCustomerInfo, true);
                    return;
                }

                throw error;
            }

            if (customerInfo) {
                await reconcileCustomerInfo(customerInfo);
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
                    const customerInfo = await runRevenueCatOperationForUser(
                        userId,
                        (currentCustomerInfo) => currentCustomerInfo,
                        () => !isCancelled
                    );

                    if (!customerInfo || isCancelled) {
                        return;
                    }

                    receiptConflictUserIdRef.current = null;
                    setLinkedElsewhereUser(null);
                    syncedRevenueCatUserIdRef.current = userId;
                    lastObservedRevenueCatFingerprintRef.current = null;
                    lastReconciledRevenueCatFingerprintRef.current = null;
                    revenueCatObservationVersionRef.current += 1;

                    void loadRevenueCatOffering(userId);

                    Purchases.addCustomerInfoUpdateListener(handleCustomerInfoUpdate);
                    isCustomerInfoListenerAttached = true;

                    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
                        if (nextState === "active") {
                            void refreshCustomerInfo().catch((error) => {
                                if (__DEV__) {
                                    console.warn("RevenueCat foreground refresh failed", error);
                                }
                            });
                        }
                    });

                    void reconcileCustomerInfo(customerInfo, true).catch((error) => {
                        if (__DEV__) {
                            console.warn("RevenueCat subscription reconciliation failed", error);
                        }
                    });

                    if (isCancelled) {
                        appStateSubscription.remove();
                    } else {
                        removeAppStateListener = () => appStateSubscription.remove();
                    }
                    return;
                } catch (error) {
                    if (isCancelled) return;

                    if (isReceiptAlreadyInUseRevenueCatError(error)) {
                        receiptConflictUserIdRef.current = userId;
                        setLinkedElsewhereUser(userId);
                        lastObservedRevenueCatFingerprintRef.current = "inactive:none";
                        lastReconciledRevenueCatFingerprintRef.current = null;
                        revenueCatObservationVersionRef.current += 1;
                        void loadRevenueCatOffering(userId);
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

        let removeAppStateListener: (() => void) | null = null;

        void syncRevenueCatIdentity();

        return () => {
            isCancelled = true;
            cancelRetryDelay?.();
            clearExpirationRefresh();
            removeAppStateListener?.();

            if (isCustomerInfoListenerAttached) {
                Purchases.removeCustomerInfoUpdateListener(handleCustomerInfoUpdate);
            }
        };
    }, [
        authStatus,
        clearRevenueCatOffering,
        identitySyncRequestId,
        loadRevenueCatOffering,
        setLinkedElsewhereUser,
        setSubscriptionForUser,
        userId,
    ]);

    return null;
}
