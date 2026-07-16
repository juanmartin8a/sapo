import { useCallback, useEffect, useMemo, useState } from "react";
import { useHeaderHeight } from "expo-router/react-navigation";
import {
    ActivityIndicator,
    Alert,
    Linking,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import Purchases, {
    type CustomerInfo,
    type PurchasesError,
    type PurchasesPackage,
    type PurchasesStoreProduct,
} from "react-native-purchases";

import CheckIcon from "@/assets/icons/check.svg";
import { authClient } from "@/clients/auth-client";
import {
    configureRevenueCat,
    getRevenueCatSubscriptionProductId,
    hasActiveRevenueCatSubscription,
    hasRevenueCatConfig,
    isReceiptAlreadyInUseRevenueCatError,
    isRevenueCatSupportedPlatform,
} from "@/clients/revenuecat";
import {
    getSubscriptionRefreshErrorStatus,
    refreshSubscriptionState,
    refreshSubscriptionStateAfterRevenueCatUpdate,
    retrySubscriptionStateAfterRevenueCatUpdateInBackground,
} from "@/clients/subscription-refresh";
import useSubscriptionStatusStore from "@/stores/subscriptionStatusStore";
import { getSessionUserAuthState } from "@/utils/auth";
import { triggerErrorHaptic, triggerLightImpactHaptic, triggerStrongImpactHaptic, triggerWarningHaptic } from "@/utils/haptics";

const TERMS_OF_USE_URL = "https://sapo.surf/terms-of-use";
const PRIVACY_POLICY_URL = "https://sapo.surf/privacy-policy";

const getSubscriptionPackage = (packages: PurchasesPackage[]) => {
    if (packages.length === 0) {
        return null;
    }

    const configuredProductId = getRevenueCatSubscriptionProductId();

    if (configuredProductId.length > 0) {
        const matchedPackage = packages.find(
            (item) => item.product.identifier === configuredProductId
        );

        if (matchedPackage) {
            return matchedPackage;
        }
    }

    const monthlyPackage = packages.find(
        (item) => item.packageType === Purchases.PACKAGE_TYPE.MONTHLY
    );

    return monthlyPackage ?? packages[0] ?? null;
};

const getAvailablePackagesFromOfferings = (
    offerings: Awaited<ReturnType<typeof Purchases.getOfferings>>
) => {
    const currentPackages = offerings.current?.availablePackages ?? [];
    const allPackages = Object.values(offerings.all).flatMap(
        (offering) => offering.availablePackages
    );

    const configuredProductId = getRevenueCatSubscriptionProductId();

    if (configuredProductId.length > 0) {
        const configuredPackage = allPackages.find(
            (item) => item.product.identifier === configuredProductId
        );

        if (configuredPackage) {
            return {
                selectedPackage: configuredPackage,
                allPackages,
                currentPackages,
            };
        }
    }

    const selectedPackage = getSubscriptionPackage(
        currentPackages.length > 0 ? currentPackages : allPackages
    );

    return {
        selectedPackage,
        allPackages,
        currentPackages,
    };
};

const getProductBillingPeriodLabel = (subscriptionProduct: PurchasesStoreProduct | null) => {
    const match = subscriptionProduct?.subscriptionPeriod?.match(/^P(\d+)([WMY])$/);

    if (!match) {
        return null;
    }

    const count = Number(match[1]);
    const unit = match[2] === "W" ? "week" : match[2] === "M" ? "month" : "year";
    return `/ ${count === 1 ? unit : `${count} ${unit}s`}`;
};

const getPackageBillingPeriodLabel = (
    subscriptionPackage: PurchasesPackage | null,
    subscriptionProduct: PurchasesStoreProduct | null
) => {
    if (!subscriptionPackage) {
        return getProductBillingPeriodLabel(subscriptionProduct) ?? "/ month";
    }

    switch (subscriptionPackage.packageType) {
        case Purchases.PACKAGE_TYPE.WEEKLY:
            return "/ week";
        case Purchases.PACKAGE_TYPE.TWO_MONTH:
            return "/ 2 months";
        case Purchases.PACKAGE_TYPE.THREE_MONTH:
            return "/ 3 months";
        case Purchases.PACKAGE_TYPE.SIX_MONTH:
            return "/ 6 months";
        case Purchases.PACKAGE_TYPE.ANNUAL:
            return "/ year";
        case Purchases.PACKAGE_TYPE.MONTHLY:
        default:
            return "/ month";
    }
};

const getPackageRenewalPeriodLabel = (
    subscriptionPackage: PurchasesPackage | null,
    subscriptionProduct: PurchasesStoreProduct | null
) => {
    return getPackageBillingPeriodLabel(subscriptionPackage, subscriptionProduct)
        .replace("/ ", "every ");
};

const PURCHASE_ERROR_MESSAGE = "Unable to complete the purchase. Please try again.";

const isPurchaseCancelledError = (error: unknown) => {
    if (!error || typeof error !== "object") {
        return false;
    }

    if ("userCancelled" in error && error.userCancelled === true) {
        return true;
    }

    if (!("code" in error)) {
        return false;
    }

    return (error as PurchasesError).code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
};

const getSubscriptionLinkedElsewhereMessage = (storeAccountLabel: string) => {
    return `This ${storeAccountLabel} account already has a S A P O subscription linked to another S A P O account. Please sign in to that account, or contact us for support at support@sapo.surf.`;
};

const getSubscriptionSyncPendingMessage = () => {
    return "Your purchase is active. We are still syncing it to SAPO and will keep trying automatically.";
};

const getSubscriptionSessionChangedMessage = () => {
    return "Your account changed while syncing the subscription. Please sign in again and retry.";
};

const retryRevenueCatUpdateSyncInBackground = (userId: string) => {
    void retrySubscriptionStateAfterRevenueCatUpdateInBackground(userId).catch((error) => {
        if (__DEV__) {
            console.warn("Background subscription sync retry failed", error);
        }
    });
};

export default function SubscriptionScreen() {
    const headerHeight = useHeaderHeight();
    const { data: session } = authClient.useSession();
    const user = session?.user;
    const userId = getSessionUserAuthState(user) === "authenticated" ? user?.id ?? null : null;
    const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [isSubscriptionLinkedElsewhere, setIsSubscriptionLinkedElsewhere] = useState(false);
    const [subscriptionPackage, setSubscriptionPackage] = useState<PurchasesPackage | null>(null);
    const [subscriptionProduct, setSubscriptionProduct] = useState<PurchasesStoreProduct | null>(null);
    const subscriptionUserId = useSubscriptionStatusStore((state) => state.userId);
    const storedHasActiveSubscription = useSubscriptionStatusStore((state) => state.hasActiveSubscription);
    const setSubscriptionForUser = useSubscriptionStatusStore((state) => state.setForUser);
    const hasActiveSubscription = subscriptionUserId === userId && storedHasActiveSubscription === true;
    const canUseRevenueCat = hasRevenueCatConfig();
    const storeAccountLabel =
        Platform.OS === "android" ? "Google" : Platform.OS === "ios" ? "Apple" : "store";

    const showSubscriptionLinkedElsewhereAlert = useCallback(() => {
        Alert.alert(
            "Subscription linked elsewhere",
            getSubscriptionLinkedElsewhereMessage(storeAccountLabel)
        );
    }, [storeAccountLabel]);

    const setCurrentSubscriptionStatus = useCallback((isActive: boolean | null) => {
        return userId ? setSubscriptionForUser(userId, isActive) : false;
    }, [setSubscriptionForUser, userId]);

    useEffect(() => {
        let isMounted = true;

        const loadSubscriptionData = async () => {
            if (!isRevenueCatSupportedPlatform || !canUseRevenueCat || !userId) {
                if (!isMounted) {
                    return;
                }

                setSubscriptionPackage(null);
                setSubscriptionProduct(null);
                setCurrentSubscriptionStatus(false);
                setIsSubscriptionLinkedElsewhere(false);
                setIsLoadingSubscription(false);
                return;
            }

            try {
                setIsLoadingSubscription(true);

                await configureRevenueCat(userId);

                const offeringsPromise = Purchases.getOfferings();
                let customerInfo: CustomerInfo | null = null;
                let isLinkedElsewhere = false;

                try {
                    const currentAppUserId = await Purchases.getAppUserID();

                    if (currentAppUserId !== userId) {
                        customerInfo = (await Purchases.logIn(userId)).customerInfo;
                    } else {
                        customerInfo = await Purchases.getCustomerInfo();
                    }
                } catch (error) {
                    if (!isReceiptAlreadyInUseRevenueCatError(error)) {
                        throw error;
                    }

                    isLinkedElsewhere = true;
                }

                const offerings = await offeringsPromise;

                const {
                    selectedPackage,
                    allPackages,
                    currentPackages,
                } = getAvailablePackagesFromOfferings(offerings);

                let fallbackProduct: PurchasesStoreProduct | null = null;
                const configuredProductId = getRevenueCatSubscriptionProductId();

                if (!selectedPackage && configuredProductId.length > 0) {
                    const products = await Purchases.getProducts(
                        [configuredProductId],
                        Purchases.PRODUCT_CATEGORY.SUBSCRIPTION
                    );

                    fallbackProduct = products[0] ?? null;
                }

                if (!isMounted) {
                    return;
                }

                setSubscriptionPackage(selectedPackage);
                setSubscriptionProduct(fallbackProduct);
                setCurrentSubscriptionStatus(
                    customerInfo ? hasActiveRevenueCatSubscription(customerInfo) : false
                );
                setIsSubscriptionLinkedElsewhere(isLinkedElsewhere);

                if (isLinkedElsewhere) {
                    showSubscriptionLinkedElsewhereAlert();
                }

                if (__DEV__) {
                    console.log("RevenueCat offerings loaded", {
                        hasCurrentOffering: offerings.current !== null,
                        currentPackagesCount: currentPackages.length,
                        allPackagesCount: allPackages.length,
                        selectedProductId: selectedPackage?.product.identifier ?? fallbackProduct?.identifier ?? null,
                    });
                }
            } catch (error) {
                if (!isMounted) {
                    return;
                }

                setSubscriptionPackage(null);
                setSubscriptionProduct(null);
                setIsSubscriptionLinkedElsewhere(false);

                if (__DEV__) {
                    console.warn("Failed to load subscription data", error);
                }
            } finally {
                if (isMounted) {
                    setIsLoadingSubscription(false);
                }
            }
        };

        void loadSubscriptionData();

        return () => {
            isMounted = false;
        };
    }, [canUseRevenueCat, setCurrentSubscriptionStatus, showSubscriptionLinkedElsewhereAlert, userId]);

    const displayPrice = subscriptionPackage?.product.priceString ?? subscriptionProduct?.priceString ?? "--";
    const billingPeriodLabel = useMemo(() => {
        return getPackageBillingPeriodLabel(subscriptionPackage, subscriptionProduct);
    }, [subscriptionPackage, subscriptionProduct]);
    const renewalPeriodLabel = useMemo(() => {
        return getPackageRenewalPeriodLabel(subscriptionPackage, subscriptionProduct);
    }, [subscriptionPackage, subscriptionProduct]);

    const buttonLabel = useMemo(() => {
        if (!isRevenueCatSupportedPlatform) {
            return "Available on iOS and Android";
        }

        if (!canUseRevenueCat) {
            return "Subscription unavailable";
        }

        if (!userId) {
            return "Sign in to subscribe";
        }

        if (isLoadingSubscription) {
            return "Loading plans...";
        }

        if (isSubscriptionLinkedElsewhere) {
            return "Sign in to original account";
        }

        if (hasActiveSubscription) {
            return "Subscribed";
        }

        if (!subscriptionPackage && !subscriptionProduct) {
            return "No plans available";
        }

        return "Get Polyglot";
    }, [
        canUseRevenueCat,
        hasActiveSubscription,
        isLoadingSubscription,
        isSubscriptionLinkedElsewhere,
        subscriptionPackage,
        subscriptionProduct,
        userId,
    ]);

    const handleSubscribe = useCallback(async () => {
        if (
            !isRevenueCatSupportedPlatform ||
            !canUseRevenueCat ||
            !userId ||
            (!subscriptionPackage && !subscriptionProduct) ||
            isLoadingSubscription ||
            isPurchasing ||
            isSubscriptionLinkedElsewhere ||
            hasActiveSubscription
        ) {
            return;
        }

        triggerLightImpactHaptic();

        try {
            setIsPurchasing(true);

            await configureRevenueCat(userId);

            const currentAppUserId = await Purchases.getAppUserID();

            if (currentAppUserId !== userId) {
                const loggedInCustomerInfo = (await Purchases.logIn(userId)).customerInfo;
                const hasActiveClientSubscriptionAfterLogin = hasActiveRevenueCatSubscription(loggedInCustomerInfo);
                let hasActiveServerSubscriptionAfterLogin = false;
                let loginRefreshFailed = false;
                let loginRefreshAuthMismatch = false;

                try {
                    const refreshResult = hasActiveClientSubscriptionAfterLogin
                        ? await refreshSubscriptionStateAfterRevenueCatUpdate(userId)
                        : await refreshSubscriptionState({ userId });
                    hasActiveServerSubscriptionAfterLogin = refreshResult?.has_active_subscription === true;
                } catch (error) {
                    const refreshErrorStatus = getSubscriptionRefreshErrorStatus(error);

                    loginRefreshFailed = true;
                    loginRefreshAuthMismatch = refreshErrorStatus === 401 || refreshErrorStatus === 409;

                    if (__DEV__) {
                        console.warn("Failed to refresh subscription state after login", error);
                    }
                }

                if (loginRefreshAuthMismatch) {
                    setIsSubscriptionLinkedElsewhere(false);
                    setCurrentSubscriptionStatus(false);
                    triggerWarningHaptic();
                    Alert.alert("Session changed", getSubscriptionSessionChangedMessage());
                    return;
                }

                const hasActiveAfterLogin =
                    hasActiveClientSubscriptionAfterLogin || hasActiveServerSubscriptionAfterLogin;

                setIsSubscriptionLinkedElsewhere(false);
                if (!setCurrentSubscriptionStatus(hasActiveAfterLogin)) {
                    triggerWarningHaptic();
                    Alert.alert("Session changed", getSubscriptionSessionChangedMessage());
                    return;
                }

                if (hasActiveAfterLogin) {
                    triggerStrongImpactHaptic();

                    if (loginRefreshFailed) {
                        retryRevenueCatUpdateSyncInBackground(userId);
                        Alert.alert("Subscription active", getSubscriptionSyncPendingMessage());
                    } else {
                        Alert.alert(
                            "Subscription active",
                            "Your SAPO subscription is already active on this account."
                        );
                    }

                    return;
                }
            }

            let customerInfo: CustomerInfo;

            if (subscriptionPackage) {
                customerInfo = (await Purchases.purchasePackage(subscriptionPackage)).customerInfo;
            } else if (subscriptionProduct) {
                customerInfo = (await Purchases.purchaseStoreProduct(subscriptionProduct)).customerInfo;
            } else {
                return;
            }

            const hasActiveClientSubscription = hasActiveRevenueCatSubscription(customerInfo);
            let hasActiveServerSubscription = false;
            let purchaseRefreshFailed = false;
            let purchaseRefreshAuthMismatch = false;

            try {
                const refreshResult = hasActiveClientSubscription
                    ? await refreshSubscriptionStateAfterRevenueCatUpdate(userId)
                    : await refreshSubscriptionState({ userId });
                hasActiveServerSubscription = refreshResult?.has_active_subscription === true;
            } catch (error) {
                const refreshErrorStatus = getSubscriptionRefreshErrorStatus(error);

                purchaseRefreshFailed = true;
                purchaseRefreshAuthMismatch = refreshErrorStatus === 401 || refreshErrorStatus === 409;

                if (__DEV__) {
                    console.warn("Failed to refresh subscription state after purchase", error);
                }
            }

            if (purchaseRefreshAuthMismatch) {
                setIsSubscriptionLinkedElsewhere(false);
                setCurrentSubscriptionStatus(false);
                triggerWarningHaptic();
                Alert.alert("Session changed", getSubscriptionSessionChangedMessage());
                return;
            }

            const isActive = hasActiveClientSubscription || hasActiveServerSubscription;

            setIsSubscriptionLinkedElsewhere(false);
            if (!setCurrentSubscriptionStatus(isActive)) {
                triggerWarningHaptic();
                Alert.alert("Session changed", getSubscriptionSessionChangedMessage());
                return;
            }

            if (isActive) {
                triggerStrongImpactHaptic();

                if (purchaseRefreshFailed) {
                    retryRevenueCatUpdateSyncInBackground(userId);
                    Alert.alert("Subscription active", getSubscriptionSyncPendingMessage());
                } else {
                    Alert.alert("Subscription active", "Your SAPO subscription is now active.");
                }

                return;
            }

            triggerStrongImpactHaptic();
            Alert.alert(
                "Purchase pending",
                "The purchase was completed but your subscription could not be verified yet. Please restore purchases from Settings."
            );
        } catch (error) {
            if (isPurchaseCancelledError(error)) {
                return;
            }

            if (isReceiptAlreadyInUseRevenueCatError(error)) {
                if (!setCurrentSubscriptionStatus(false)) {
                    triggerWarningHaptic();
                    Alert.alert("Session changed", getSubscriptionSessionChangedMessage());
                    return;
                }

                setIsSubscriptionLinkedElsewhere(true);
                triggerWarningHaptic();
                showSubscriptionLinkedElsewhereAlert();
                return;
            }

            if (__DEV__) {
                console.warn("Purchase failed", error);
            }

            triggerErrorHaptic();
            Alert.alert("Purchase failed", PURCHASE_ERROR_MESSAGE);
        } finally {
            setIsPurchasing(false);
        }
    }, [
        canUseRevenueCat,
        hasActiveSubscription,
        isLoadingSubscription,
        isPurchasing,
        isSubscriptionLinkedElsewhere,
        setCurrentSubscriptionStatus,
        showSubscriptionLinkedElsewhereAlert,
        subscriptionPackage,
        subscriptionProduct,
        userId,
    ]);

    const isSubscribeDisabled =
        !isRevenueCatSupportedPlatform ||
        !canUseRevenueCat ||
        !userId ||
        (!subscriptionPackage && !subscriptionProduct) ||
        isLoadingSubscription ||
        isPurchasing ||
        isSubscriptionLinkedElsewhere ||
        hasActiveSubscription;

    const handleOpenTermsOfUse = useCallback(() => {
        void Linking.openURL(TERMS_OF_USE_URL);
    }, []);

    const handleOpenPrivacyPolicy = useCallback(() => {
        void Linking.openURL(PRIVACY_POLICY_URL);
    }, []);

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={[styles.contentContainer, { paddingTop: headerHeight + 24 }]}
        >
            <View style={styles.card}>
                <View style={styles.planBadge}>
                    <Text style={styles.planBadgeText}>Polyglot</Text>
                </View>

                <View style={styles.priceRow}>
                    <Text style={styles.priceText}>{displayPrice}</Text>
                    <Text style={styles.priceSuffix}>{billingPeriodLabel}</Text>
                </View>

                <Text style={styles.planDescription}>
                    For real-world multilingual needs
                </Text>

                <View style={styles.featureList}>
                    <View style={styles.featureRow}>
                        <CheckIcon width={18} height={18} stroke="#000" style={styles.featureIcon} />
                        <Text style={styles.featureText}>6,000 respell input characters</Text>
                    </View>
                    <View style={styles.featureRow}>
                        <CheckIcon width={18} height={18} stroke="#000" style={styles.featureIcon} />
                        <Text style={styles.featureText}>500,000 translate input characters</Text>
                    </View>
                </View>

                <Pressable
                    onPress={handleSubscribe}
                    disabled={isSubscribeDisabled}
                    style={({ pressed }) => [
                        styles.subscribeButton,
                        (pressed || isPurchasing) && styles.subscribeButtonPressed,
                        isSubscribeDisabled && styles.subscribeButtonDisabled,
                    ]}
                >
                    {isPurchasing ? (
                        <ActivityIndicator color="#fff" size="small" />
                    ) : (
                        <Text style={styles.subscribeButtonText}>{buttonLabel}</Text>
                    )}
                </Pressable>

                <Text style={styles.footnote}>
                    {`Auto-renews ${renewalPeriodLabel}. Cancel anytime from your ${storeAccountLabel} account subscriptions settings.`}
                </Text>

                <View style={styles.legalLinksRow}>
                    <Text
                        accessibilityRole="link"
                        onPress={handleOpenTermsOfUse}
                        style={styles.legalLink}
                    >
                        Terms of Use
                    </Text>
                    <Text
                        accessibilityRole="link"
                        onPress={handleOpenPrivacyPolicy}
                        style={styles.legalLink}
                    >
                        Privacy Policy
                    </Text>
                </View>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#E1ECDD",
    },
    contentContainer: {
        flexGrow: 1,
        paddingHorizontal: 16,
        paddingBottom: 32,
    },
    card: {
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 20,
        gap: 14,
    },
    planBadge: {
        alignSelf: "flex-start",
        backgroundColor: "#000",
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 10,
    },
    planBadgeText: {
        color: "#fff",
        fontSize: 12,
        fontWeight: "700",
        letterSpacing: 0.3,
    },
    priceRow: {
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 6,
    },
    priceText: {
        fontSize: 34,
        lineHeight: 38,
        fontWeight: "700",
        color: "#000",
    },
    priceSuffix: {
        fontSize: 14,
        lineHeight: 20,
        fontWeight: "500",
        color: "#8E8E93",
        marginBottom: 4,
    },
    planDescription: {
        fontSize: 14,
        lineHeight: 20,
        fontWeight: "400",
        color: "#3A3A3C",
    },
    featureList: {
        borderTopWidth: 1,
        borderTopColor: "#ECECEC",
        paddingTop: 14,
        gap: 10,
    },
    featureRow: {
        flexDirection: "row",
        alignItems: "center",
    },
    featureIcon: {
        marginRight: 10,
    },
    featureText: {
        fontSize: 15,
        lineHeight: 20,
        fontWeight: "500",
        color: "#000",
    },
    subscribeButton: {
        marginTop: 6,
        backgroundColor: "#000",
        borderRadius: 12,
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
    },
    subscribeButtonPressed: {
        opacity: 0.8,
    },
    subscribeButtonDisabled: {
        backgroundColor: "#B6B6B6",
    },
    subscribeButtonText: {
        color: "#fff",
        fontSize: 15,
        lineHeight: 20,
        fontWeight: "600",
        textAlign: "center",
    },
    footnote: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: "400",
        color: "#8E8E93",
    },
    legalLinksRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    legalLink: {
        alignSelf: "flex-start",
        color: "#000",
        fontSize: 12,
        lineHeight: 16,
        fontWeight: "600",
        textDecorationLine: "underline",
    },
});
