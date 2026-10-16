import { FieldGroup } from "@expo/ui";

import SettingsRow from "@/components/settings/ui/SettingsRow";

interface SettingsSessionSectionProps {
    isPending: boolean;
    isSigningOut: boolean;
    isManagingSubscription: boolean;
    shouldShowAuthenticatedActions: boolean;
    onSignIn: () => void;
    onSignOut: () => Promise<void>;
}

export default function SettingsSessionSection({
    isPending,
    isSigningOut,
    isManagingSubscription,
    shouldShowAuthenticatedActions,
    onSignIn,
    onSignOut,
}: SettingsSessionSectionProps) {
    const label = !shouldShowAuthenticatedActions
        ? "Sign in"
        : isSigningOut
          ? "Signing out..."
          : "Sign out";

    return (
        <FieldGroup.Section>
            <SettingsRow
                label={label}
                icon={shouldShowAuthenticatedActions ? "signOut" : "signIn"}
                loading={isSigningOut}
                destructive={shouldShowAuthenticatedActions}
                disabled={isPending || isSigningOut || isManagingSubscription}
                onPress={() => {
                    if (!shouldShowAuthenticatedActions) {
                        onSignIn();
                        return;
                    }

                    void onSignOut();
                }}
            />
        </FieldGroup.Section>
    );
}
