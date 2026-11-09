import { Link } from "@tanstack/solid-router";
import { Show } from "solid-js";
import Icon from "@/components/ui/Icon";
import { useAppState } from "@/providers/AppProvider";
import LocalModelSettings from "./LocalModelSettings";

export default function LocalModelSettingsScreen() {
    const { basePath, isPwa } = useAppState();
    return (
        <main class="account-screen settings-screen">
            <div class="account-card settings-card">
                <Show when={isPwa}>
                    <Link class="back-link" to={`${basePath}/settings/`}>
                        <Icon name="arrow-left" size={24} />
                        <span>Back to settings</span>
                    </Link>
                </Show>
                <header class="settings-heading">
                    <h1>Local AI</h1>
                </header>
                <LocalModelSettings />
            </div>
        </main>
    );
}
