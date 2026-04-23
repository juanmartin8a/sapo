import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    Pressable,
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
import { refreshSubscriptionState } from "@/clients/subscription-refresh";
import { isAnonymousSessionUser } from "@/utils/auth";

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

const getPackageBillingPeriodLabel = (subscriptionPackage: PurchasesPackage | null) => {
    if (!subscriptionPackage) {
        return "/ month";
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

const getErrorMessage = (error: unknown) => {
    if (typeof error === "object" && error && "message" in error) {
        const message = error.message;

        if (typeof message === "string" && message.length > 0) {
            return message;
        }
    }

    return "Please try again.";
};

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
    return "The purchase was completed, but we could not finish syncing your subscription yet. Please restore purchases from Settings in a moment.";
};

export default function SubscriptionScreen() {
    const { data: session } = authClient.useSession();
    const user = session?.user;
    const isAnonymousUser = isAnonymousSessionUser(user);
    const userId = !isAnonymousUser ? user?.id ?? null : null;
    const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
    const [isSubscriptionLinkedElsewhere, setIsSubscriptionLinkedElsewhere] = useState(false);
    const [subscriptionPackage, setSubscriptionPackage] = useState<PurchasesPackage | null>(null);
    const [subscriptionProduct, setSubscriptionProduct] = useState<PurchasesStoreProduct | null>(null);
    const canUseRevenueCat = hasRevenueCatConfig();
    const storeAccountLabel =
        Platform.OS === "android" ? "Google" : Platform.OS === "ios" ? "Apple" : "store";

    const showSubscriptionLinkedElsewhereAlert = useCallback(() => {
        Alert.alert(
            "Subscription linked elsewhere",
            getSubscriptionLinkedElsewhereMessage(storeAccountLabel)
        );
    }, [storeAccountLabel]);

    useEffect(() => {
        let isMounted = true;

        const loadSubscriptionData = async () => {
            if (!isRevenueCatSupportedPlatform || !canUseRevenueCat || !userId) {
                if (!isMounted) {
                    return;
                }

                setSubscriptionPackage(null);
                setSubscriptionProduct(null);
                setHasActiveSubscription(false);
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
                setHasActiveSubscription(
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
                setHasActiveSubscription(false);
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
    }, [canUseRevenueCat, showSubscriptionLinkedElsewhereAlert, userId]);

    const displayPrice = subscriptionPackage?.product.priceString ?? subscriptionProduct?.priceString ?? "--";
    const billingPeriodLabel = useMemo(() => {
        return getPackageBillingPeriodLabel(subscriptionPackage);
    }, [subscriptionPackage]);

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

        try {
            setIsPurchasing(true);

            await configureRevenueCat(userId);

            const currentAppUserId = await Purchases.getAppUserID();

            if (currentAppUserId !== userId) {
                const loggedInCustomerInfo = (await Purchases.logIn(userId)).customerInfo;
                const hasActiveAfterLogin = hasActiveRevenueCatSubscription(loggedInCustomerInfo);

                setIsSubscriptionLinkedElsewhere(false);
                setHasActiveSubscription(hasActiveAfterLogin);

                if (hasActiveAfterLogin) {
                    try {
                        await refreshSubscriptionState();
                        Alert.alert(
                            "Subscription active",
                            "Your SAPO subscription is already active on this account."
                        );
                    } catch (error) {
                        if (__DEV__) {
                            console.warn("Failed to refresh subscription state after login", error);
                        }

                        Alert.alert("Subscription syncing", getSubscriptionSyncPendingMessage());
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

            const isActive = hasActiveRevenueCatSubscription(customerInfo);

            setIsSubscriptionLinkedElsewhere(false);
            setHasActiveSubscription(isActive);

            if (isActive) {
                try {
                    await refreshSubscriptionState();
                    Alert.alert("Subscription active", "Your SAPO subscription is now active.");
                } catch (error) {
                    if (__DEV__) {
                        console.warn("Failed to refresh subscription state after purchase", error);
                    }

                    Alert.alert("Subscription syncing", getSubscriptionSyncPendingMessage());
                }

                return;
            }

            Alert.alert(
                "Purchase pending",
                "The purchase was completed but your subscription could not be verified yet. Please restore purchases from Settings."
            );
        } catch (error) {
            if (isPurchaseCancelledError(error)) {
                return;
            }

            if (isReceiptAlreadyInUseRevenueCatError(error)) {
                setIsSubscriptionLinkedElsewhere(true);
                showSubscriptionLinkedElsewhereAlert();
                return;
            }

            Alert.alert("Purchase failed", getErrorMessage(error));
        } finally {
            setIsPurchasing(false);
        }
    }, [
        canUseRevenueCat,
        hasActiveSubscription,
        isLoadingSubscription,
        isPurchasing,
        isSubscriptionLinkedElsewhere,
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

    return (
        <View style={styles.container}>
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
                        <Text style={styles.featureText}>5,000 respelled words</Text>
                    </View>
                    <View style={styles.featureRow}>
                        <CheckIcon width={18} height={18} stroke="#000" style={styles.featureIcon} />
                        <Text style={styles.featureText}>20,000 translated words</Text>
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
                    {`Auto-renews monthly. Cancel anytime from your ${storeAccountLabel} account subscriptions settings.`}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#E1ECDD",
        paddingTop: 24,
        paddingHorizontal: 16,
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
});
