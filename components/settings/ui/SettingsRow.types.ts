export type SettingsRowIcon =
    | "subscription"
    | "restore"
    | "manage"
    | "localModels"
    | "dataControls"
    | "signIn"
    | "signOut"
    | "trash";

export interface SettingsRowProps {
    label: string;
    icon: SettingsRowIcon;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
    destructive?: boolean;
    showDisclosure?: boolean;
}
