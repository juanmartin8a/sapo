import type { AppTheme } from '@/constants/theme';
import useThemeStyles from '@/hooks/useThemeStyles';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import CheckIcon from "@/assets/icons/check.svg";
import {
    SUBSCRIPTION_PLAN_DISPLAY_NAMES,
    SUBSCRIPTION_PLAN_LIMITS,
} from "@/constants/subscription";
import { UI_DISABLED_OPACITY } from "@/constants/ui";

interface SubscriptionPlanCardProps {
    displayPrice: string;
    billingPeriodLabel: string;
    renewalPeriodLabel: string;
    storeAccountLabel: string;
    buttonLabel: string;
    isPurchasing: boolean;
    isSubscribeDisabled: boolean;
    onSubscribe: () => void;
    onOpenTermsOfUse: () => void;
    onOpenPrivacyPolicy: () => void;
}

const polyglotPlanLimits = SUBSCRIPTION_PLAN_LIMITS.polyglot;
const PLAN_FEATURES = [
    `${polyglotPlanLimits.respell_monthly_char_limit.toLocaleString("en-US")} respell input characters`,
    `${polyglotPlanLimits.translate_monthly_char_limit.toLocaleString("en-US")} translate input characters`,
    "Increased input limits per request",
] as const;

// Preserve the subscription card's original light appearance.
const LIGHT_PLAN_CARD_COLORS = {
    border: "#DDE7E0",
    descriptionText: "#636366",
    divider: "#AAB4AE",
    linkPressed: "#8E8E93",
    mutedText: "#737373",
    primary: "#000",
    secondaryText: "#1C1C1E",
    shadow: "#18231D",
    white: "#fff",
} as const;

export default function SubscriptionPlanCard({
    displayPrice,
    billingPeriodLabel,
    renewalPeriodLabel,
    storeAccountLabel,
    buttonLabel,
    isPurchasing,
    isSubscribeDisabled,
    onSubscribe,
    onOpenTermsOfUse,
    onOpenPrivacyPolicy,
}: SubscriptionPlanCardProps) {
    const { styles, settingsColors: SETTINGS_COLORS } = useThemeStyles(createStyles);
    return (
        <View style={styles.card}>
            <View style={styles.planHeader}>
                <Text style={styles.planName}>{SUBSCRIPTION_PLAN_DISPLAY_NAMES.POLYGLOT}</Text>
                <Text style={styles.planDescription}>For real-world multilingual needs</Text>
            </View>

            <View style={styles.priceRow}>
                <Text style={styles.priceText}>{displayPrice}</Text>
                <Text style={styles.priceSuffix}>{billingPeriodLabel}</Text>
            </View>

            <View style={styles.featureList}>
                <Text style={styles.featureListLabel}>Included</Text>
                {PLAN_FEATURES.map((feature) => (
                    <View key={feature} style={styles.featureRow}>
                        <CheckIcon width={18} height={18} stroke={SETTINGS_COLORS.accent} />
                        <Text style={styles.featureText}>{feature}</Text>
                    </View>
                ))}
            </View>

            <Pressable
                onPress={onSubscribe}
                disabled={isSubscribeDisabled}
                style={({ pressed }) => [
                    styles.subscribeButton,
                    (pressed || isPurchasing) && styles.subscribeButtonPressed,
                    isSubscribeDisabled && styles.subscribeButtonDisabled,
                ]}
            >
                {isPurchasing ? (
                    <ActivityIndicator color={styles.subscribeButtonText.color} size="small" />
                ) : (
                    <Text style={styles.subscribeButtonText}>{buttonLabel}</Text>
                )}
            </Pressable>

            <Text style={styles.footnote}>
                {`Auto-renews ${renewalPeriodLabel}. Cancel anytime from your ${storeAccountLabel} account subscriptions settings.`}
            </Text>

            <View style={styles.legalLinksRow}>
                <Pressable accessibilityRole="link" hitSlop={6} onPress={onOpenTermsOfUse}>
                    {({ pressed }) => (
                        <Text style={[styles.legalLink, pressed && styles.legalLinkPressed]}>
                            Terms of Use
                        </Text>
                    )}
                </Pressable>
                <View style={styles.legalDivider} />
                <Pressable accessibilityRole="link" hitSlop={6} onPress={onOpenPrivacyPolicy}>
                    {({ pressed }) => (
                        <Text style={[styles.legalLink, pressed && styles.legalLinkPressed]}>
                            Privacy Policy
                        </Text>
                    )}
                </Pressable>
            </View>
        </View>
    );
}

const createStyles = ({ scheme, colors, settingsColors: SETTINGS_COLORS }: AppTheme) => {
    const planColors = scheme === 'light' ? LIGHT_PLAN_CARD_COLORS : {
        border: SETTINGS_COLORS.screenBackground,
        descriptionText: SETTINGS_COLORS.mutedText,
        divider: SETTINGS_COLORS.mutedChevron,
        linkPressed: SETTINGS_COLORS.mutedText,
        mutedText: SETTINGS_COLORS.mutedText,
        primary: SETTINGS_COLORS.primaryText,
        secondaryText: SETTINGS_COLORS.primaryText,
        shadow: colors.shadow,
        white: SETTINGS_COLORS.surface,
    };

    return StyleSheet.create({
        card: {
            backgroundColor: SETTINGS_COLORS.surface,
            borderWidth: 1,
            borderColor: planColors.border,
            borderRadius: 24,
            padding: 22,
            gap: 18,
            shadowColor: planColors.shadow,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.07,
            shadowRadius: 20,
            elevation: 2,
        },
        planHeader: {
            gap: 5,
        },
        planName: {
            color: planColors.primary,
            fontSize: 21,
            lineHeight: 26,
            fontWeight: "700",
            letterSpacing: -0.3,
        },
        priceRow: {
            flexDirection: "row",
            alignItems: "flex-end",
            gap: 7,
        },
        priceText: {
            fontSize: 40,
            lineHeight: 44,
            fontWeight: "800",
            letterSpacing: -1,
            color: planColors.primary,
        },
        priceSuffix: {
            fontSize: 14,
            lineHeight: 20,
            fontWeight: "500",
            color: planColors.mutedText,
            marginBottom: 5,
        },
        planDescription: {
            fontSize: 15,
            lineHeight: 21,
            fontWeight: "400",
            color: planColors.descriptionText,
        },
        featureList: {
            gap: 12,
        },
        featureListLabel: {
            color: planColors.mutedText,
            fontSize: 11,
            lineHeight: 14,
            fontWeight: "700",
            letterSpacing: 0.8,
            textTransform: "uppercase",
        },
        featureRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
        },
        featureText: {
            flex: 1,
            fontSize: 15,
            lineHeight: 21,
            fontWeight: "500",
            color: planColors.secondaryText,
        },
        subscribeButton: {
            backgroundColor: planColors.primary,
            borderRadius: 12,
            minHeight: 42,
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 12,
            paddingHorizontal: 16,
        },
        subscribeButtonPressed: {
            opacity: 0.78,
        },
        subscribeButtonDisabled: {
            opacity: UI_DISABLED_OPACITY,
        },
        subscribeButtonText: {
            color: planColors.white,
            fontSize: 14,
            lineHeight: 20,
            fontWeight: "600",
            textAlign: "center",
        },
        footnote: {
            fontSize: 12,
            lineHeight: 17,
            fontWeight: "400",
            color: planColors.mutedText,
            textAlign: "center",
        },
        legalLinksRow: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
        },
        legalDivider: {
            width: 3,
            height: 3,
            borderRadius: 2,
            backgroundColor: planColors.divider,
        },
        legalLink: {
            color: planColors.secondaryText,
            fontSize: 12,
            lineHeight: 16,
            fontWeight: "600",
        },
        legalLinkPressed: {
            color: planColors.linkPressed,
        },
    });
};
