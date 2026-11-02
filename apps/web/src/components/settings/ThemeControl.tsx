import { createSignal, For, onSettled } from "solid-js";
import { SITE_THEME_STORAGE_KEY, watchSiteTheme, type SiteTheme } from "@/lib/site-theme";

const themes = [
    { value: "system", label: "System", icon: "sun-moon" },
    { value: "light", label: "Light", icon: "sun" },
    { value: "dark", label: "Dark", icon: "moon" },
] as const;

export default function ThemeControl() {
    const [theme, setTheme] = createSignal<SiteTheme>("system");
    onSettled(() => watchSiteTheme(setTheme));

    const chooseTheme = (next: SiteTheme) => {
        document.documentElement.dataset.siteTheme = next;
        setTheme(next);
        try {
            localStorage.setItem(SITE_THEME_STORAGE_KEY, next);
        } catch {
            // The choice still applies for this visit when storage is unavailable.
        }
    };

    return (
        <div class="site-theme-control" role="group" aria-label="Appearance">
            <For each={themes}>
                {(option) => (
                    <button
                        type="button"
                        aria-pressed={theme() === option.value ? "true" : "false"}
                        onClick={() => chooseTheme(option.value)}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            class={`lucide lucide-${option.icon}`}
                            aria-hidden="true"
                        >
                            {option.value === "light" ? (
                                <>
                                    <circle cx="12" cy="12" r="4" />
                                    <path d="M12 2v2" />
                                    <path d="M12 20v2" />
                                    <path d="m4.93 4.93 1.41 1.41" />
                                    <path d="m17.66 17.66 1.41 1.41" />
                                    <path d="M2 12h2" />
                                    <path d="M20 12h2" />
                                    <path d="m6.34 17.66-1.41 1.41" />
                                    <path d="m19.07 4.93-1.41 1.41" />
                                </>
                            ) : option.value === "dark" ? (
                                <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
                            ) : (
                                <>
                                    <path d="M12 2v2" />
                                    <path d="M14.837 16.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715" />
                                    <path d="M16 12a4 4 0 0 0-4-4" />
                                    <path d="m19 5-1.256 1.256" />
                                    <path d="M20 12h2" />
                                </>
                            )}
                        </svg>
                        <span>{option.label}</span>
                    </button>
                )}
            </For>
        </div>
    );
}
