import { createContext, createSignal, onSettled, useContext } from "solid-js";
import type { JSX } from "@solidjs/web";
import { SITE_THEME_STORAGE_KEY, watchSiteTheme, type SiteTheme } from "@/lib/site-theme";

function createSiteThemeState() {
    const [theme, setTheme] = createSignal<SiteTheme>("system");
    onSettled(() => watchSiteTheme(setTheme));

    return {
        theme,
        chooseTheme(next: SiteTheme) {
            document.documentElement.dataset.siteTheme = next;
            setTheme(next);
            try {
                localStorage.setItem(SITE_THEME_STORAGE_KEY, next);
            } catch {
                // The choice still applies for this visit when storage is unavailable.
            }
        },
    };
}

const SiteThemeContext = createContext<ReturnType<typeof createSiteThemeState>>();

export default function SiteThemeProvider(props: { children: JSX.Element }) {
    const theme = createSiteThemeState();
    return <SiteThemeContext value={theme}>{props.children}</SiteThemeContext>;
}

export function useSiteTheme() {
    const theme = useContext(SiteThemeContext);
    if (!theme) throw new Error("useSiteTheme must be used within SiteThemeProvider");
    return theme;
}
