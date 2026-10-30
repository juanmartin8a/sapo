export type SiteTheme = "system" | "light" | "dark";

export const SITE_THEME_STORAGE_KEY = "sapo:site-theme";

export function parseSiteTheme(value: unknown): SiteTheme {
    return value === "light" || value === "dark" ? value : "system";
}

export function isThemePreviewPath(pathname: string) {
    return pathname === "/" || pathname.replace(/\/$/, "") === "/about";
}

// Run in the head before styles paint; system appearance also works without JavaScript.
export const SITE_THEME_INIT_SCRIPT = `try{document.documentElement.dataset.siteTheme=localStorage.getItem("${SITE_THEME_STORAGE_KEY}")||"system"}catch{}`;
