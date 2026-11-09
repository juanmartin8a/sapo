import { createFileRoute } from "@tanstack/solid-router";
import LocalModelSettingsScreen from "@/components/settings/LocalModelSettingsScreen";

export const Route = createFileRoute("/pwa/settings_/local-ai")({
    component: LocalModelSettingsScreen,
});
