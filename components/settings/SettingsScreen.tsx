import { FieldGroup } from "@expo/ui";

import SettingsAccountSection from "@/components/settings/SettingsAccountSection";
import SettingsSessionSection from "@/components/settings/SettingsSessionSection";
import SettingsForm from "@/components/settings/ui/SettingsForm";
import SettingsRow from "@/components/settings/ui/SettingsRow";
import { SETTINGS_ROUTES } from "@/constants/routes";
import useSettingsActions from "@/hooks/useSettingsActions";

export default function SettingsScreen() {
    const actions = useSettingsActions();

    return (
        <SettingsForm>
            <SettingsAccountSection
                isSigningOut={actions.isSigningOut}
                isRestoringPurchases={actions.isRestoringPurchases}
                isManagingSubscription={actions.isManagingSubscription}
                isRestorePurchasesDisabled={actions.isRestorePurchasesDisabled}
                isManageSubscriptionDisabled={actions.isManageSubscriptionDisabled}
                shouldShowAuthenticatedActions={actions.shouldShowAuthenticatedActions}
                onOpenSubscription={actions.handleOpenSubscription}
                onRestorePurchases={actions.handleRestorePurchases}
                onManageSubscription={actions.handleManageSubscription}
                onOpenDataControls={actions.handleOpenDataControls}
            />

            <FieldGroup.Section>
                <SettingsRow
                    label={SETTINGS_ROUTES.LOCAL_MODELS.title}
                    icon="localModels"
                    showDisclosure
                    disabled={actions.isSigningOut}
                    onPress={actions.handleOpenLocalModels}
                />
            </FieldGroup.Section>

            <SettingsSessionSection
                isPending={actions.isPending}
                isSigningOut={actions.isSigningOut}
                isManagingSubscription={actions.isManagingSubscription}
                shouldShowAuthenticatedActions={actions.shouldShowAuthenticatedActions}
                onSignIn={actions.handleSignIn}
                onSignOut={actions.handleSignOut}
            />
        </SettingsForm>
    );
}
