const rawConvexSiteUrl = process.env.EXPO_PUBLIC_CONVEX_SITE_URL?.trim();

export const CONVEX_SITE_URL = rawConvexSiteUrl
    ? rawConvexSiteUrl.replace(/\/$/, "")
    : null;

export function getRequiredConvexSiteUrl() {
    if (!CONVEX_SITE_URL) {
        throw new Error("Missing EXPO_PUBLIC_CONVEX_SITE_URL");
    }

    return CONVEX_SITE_URL;
}
