import { createSignal, onSettled } from "solid-js";
import { parseSiteTheme, SITE_THEME_STORAGE_KEY } from "@/lib/site-theme";

export default function ThemeControl() {
    const [theme, setTheme] = createSignal("system");

    onSettled(() => {
        let initial = parseSiteTheme(document.documentElement.dataset.siteTheme);
        try {
            initial = parseSiteTheme(localStorage.getItem(SITE_THEME_STORAGE_KEY));
        } catch {
            // Retain the current visit’s choice if storage becomes unavailable.
        }
        document.documentElement.dataset.siteTheme = initial;
        setTheme(initial);
        const sync = (event: StorageEvent) => {
            if (event.key !== SITE_THEME_STORAGE_KEY && event.key !== null) return;
            if (event.storageArea !== localStorage) return;
            const next = parseSiteTheme(event.newValue);
            document.documentElement.dataset.siteTheme = next;
            setTheme(next);
        };
        window.addEventListener("storage", sync);
        return () => window.removeEventListener("storage", sync);
    });

    return (
        <label class="site-theme-control">
            <span class="sr-only">Appearance</span>
            <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                aria-hidden="true"
            >
                <circle cx="12" cy="12" r="8" />
                <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" />
            </svg>
            <select
                aria-label="Appearance"
                value={theme()}
                onChange={(event) => {
                    const next = parseSiteTheme(event.currentTarget.value);
                    document.documentElement.dataset.siteTheme = next;
                    setTheme(next);
                    try {
                        localStorage.setItem(SITE_THEME_STORAGE_KEY, next);
                    } catch {
                        // The choice still applies for this visit when storage is unavailable.
                    }
                }}
            >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
            </select>
        </label>
    );
}
