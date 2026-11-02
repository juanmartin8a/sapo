import { For } from "solid-js";
import { useSiteTheme } from "@/providers/SiteThemeProvider";
import Icon from "@/components/ui/Icon";

const themes = [
    { value: "system", label: "System", icon: "sun-moon" },
    { value: "light", label: "Light", icon: "sun" },
    { value: "dark", label: "Dark", icon: "moon" },
] as const;

export default function ThemeControl() {
    const { theme, chooseTheme } = useSiteTheme();

    return (
        <div class="site-theme-control" role="group" aria-label="Appearance">
            <For each={themes}>
                {(option) => (
                    <button
                        type="button"
                        aria-pressed={theme() === option.value ? "true" : "false"}
                        onClick={() => chooseTheme(option.value)}
                    >
                        <Icon name={option.icon} size={24} />
                        <span>{option.label}</span>
                    </button>
                )}
            </For>
        </div>
    );
}
