import { createFileRoute } from "@tanstack/solid-router";
import SettingsScreen from "@/components/settings/SettingsScreen";

export const Route = createFileRoute("/_translator/settings")({
    component: SettingsScreen,
});
