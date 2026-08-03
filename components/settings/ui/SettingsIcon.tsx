import type { ComponentType } from "react";
import { StyleSheet, View } from "react-native";
import type { SvgProps } from "react-native-svg";

import BrainIcon from "@/assets/icons/brain.svg";
import EarthIcon from "@/assets/icons/earth.svg";
import LogInIcon from "@/assets/icons/log-in.svg";
import LogOutIcon from "@/assets/icons/log-out.svg";
import RepeatIcon from "@/assets/icons/repeat.svg";
import SettingsIconSvg from "@/assets/icons/settings.svg";
import SlidersHorizontalIcon from "@/assets/icons/sliders-horizontal.svg";
import TrashIcon from "@/assets/icons/trash.svg";
import type { SettingsRowIcon } from "@/components/settings/ui/SettingsRow.types";

const ICONS = {
    subscription: EarthIcon,
    restore: RepeatIcon,
    manage: SettingsIconSvg,
    localModels: BrainIcon,
    dataControls: SlidersHorizontalIcon,
    signIn: LogInIcon,
    signOut: LogOutIcon,
    trash: TrashIcon,
} satisfies Record<SettingsRowIcon, ComponentType<SvgProps>>;

interface SettingsIconProps {
    icon: SettingsRowIcon;
    color: string;
}

export default function SettingsIcon({ icon, color }: SettingsIconProps) {
    const Icon = ICONS[icon];

    return (
        <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.container}
        >
            <Icon width={20} height={20} stroke={color} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: 24,
        height: 24,
        alignItems: "center",
        justifyContent: "center",
    },
});
