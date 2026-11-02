export type SiteTheme = "system" | "light" | "dark";

export const SITE_THEME_STORAGE_KEY = "sapo:site-theme";

export function parseSiteTheme(value: unknown): SiteTheme {
    return value === "light" || value === "dark" ? value : "system";
}

export function watchSiteTheme(onChange: (theme: SiteTheme) => void) {
    const apply = (theme: SiteTheme) => {
        document.documentElement.dataset.siteTheme = theme;
        onChange(theme);
    };
    let initial = parseSiteTheme(document.documentElement.dataset.siteTheme);
    try {
        initial = parseSiteTheme(localStorage.getItem(SITE_THEME_STORAGE_KEY));
    } catch {
        // Keep the current visit’s choice when storage is unavailable.
    }
    apply(initial);
    const sync = (event: StorageEvent) => {
        if (event.key !== SITE_THEME_STORAGE_KEY && event.key !== null) return;
        try {
            if (event.storageArea !== localStorage) return;
        } catch {
            return;
        }
        apply(parseSiteTheme(event.newValue));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
}

export function watchPwaThemeColor() {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
        const theme = parseSiteTheme(document.documentElement.dataset.siteTheme);
        const dark = theme === "dark" || (theme === "system" && media.matches);
        const color = dark ? "#101010" : "#ffffff";
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta && meta.getAttribute("content") !== color) meta.setAttribute("content", color);
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-site-theme"],
    });
    // The router can replace metadata after hydration or navigation.
    observer.observe(document.head, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["content"],
    });
    media.addEventListener("change", sync);
    sync();
    return () => {
        observer.disconnect();
        media.removeEventListener("change", sync);
    };
}

// Run in the head before styles paint; system appearance also works without JavaScript.
export const SITE_THEME_INIT_SCRIPT = `try{document.documentElement.dataset.siteTheme=localStorage.getItem("${SITE_THEME_STORAGE_KEY}")||"system"}catch{}`;
