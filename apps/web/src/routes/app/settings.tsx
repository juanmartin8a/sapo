import { createFileRoute } from "@tanstack/solid-router";
import SettingsScreen from "@/components/settings/SettingsScreen";

export const Route = createFileRoute("/app/settings")({
    component: SettingsScreen,
});
