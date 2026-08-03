import { FieldGroup } from "@expo/ui";

import SettingsRow from "@/components/settings/ui/SettingsRow";
import { SETTINGS_ROUTES } from "@/constants/routes";

interface SettingsAccountSectionProps {
    isSigningOut: boolean;
    isRestoringPurchases: boolean;
    isManagingSubscription: boolean;
    isRestorePurchasesDisabled: boolean;
    isManageSubscriptionDisabled: boolean;
    shouldShowAuthenticatedActions: boolean;
    onOpenSubscription: () => void;
    onRestorePurchases: () => Promise<void>;
    onManageSubscription: () => Promise<void>;
    onOpenDataControls: () => void;
}

export default function SettingsAccountSection({
    isSigningOut,
    isRestoringPurchases,
    isManagingSubscription,
    isRestorePurchasesDisabled,
    isManageSubscriptionDisabled,
    shouldShowAuthenticatedActions,
    onOpenSubscription,
    onRestorePurchases,
    onManageSubscription,
    onOpenDataControls,
}: SettingsAccountSectionProps) {
    return (
        <FieldGroup.Section title="Account">
            <SettingsRow
                label={SETTINGS_ROUTES.SUBSCRIPTION.title}
                icon="subscription"
                showDisclosure
                disabled={isSigningOut}
                onPress={onOpenSubscription}
            />
            {shouldShowAuthenticatedActions ? (
                <SettingsRow
                    label={isRestoringPurchases ? "Restoring purchases..." : "Restore purchases"}
                    icon="restore"
                    loading={isRestoringPurchases}
                    disabled={isRestorePurchasesDisabled}
                    onPress={() => {
                        void onRestorePurchases();
                    }}
                />
            ) : null}
            {shouldShowAuthenticatedActions ? (
                <SettingsRow
                    label="Manage subscription"
                    icon="manage"
                    disabled={isManageSubscriptionDisabled}
                    onPress={() => {
                        void onManageSubscription();
                    }}
                />
            ) : null}
            {shouldShowAuthenticatedActions ? (
                <SettingsRow
                    label={SETTINGS_ROUTES.DATA_CONTROLS.title}
                    icon="dataControls"
                    showDisclosure
                    disabled={isSigningOut}
                    onPress={onOpenDataControls}
                />
            ) : null}
        </FieldGroup.Section>
    );
}
