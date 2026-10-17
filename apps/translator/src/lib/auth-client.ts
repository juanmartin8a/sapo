import { createAuthClient } from "better-auth/client";
import {
    convexClient,
    crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";

export const isAuthConfigured = Boolean(
    import.meta.env.VITE_CONVEX_SITE_URL && import.meta.env.VITE_CONVEX_URL,
);

function createWebAuthClient() {
    return createAuthClient({
        baseURL: import.meta.env.VITE_CONVEX_SITE_URL,
        plugins: [convexClient(), crossDomainClient()],
    });
}

// The cross-domain plugin uses localStorage. Construct it only in the browser.
let browserClient: ReturnType<typeof createWebAuthClient> | undefined;

export function getAuthClient() {
    if (typeof window === "undefined")
        throw new Error("Authentication is browser-only.");
    if (!isAuthConfigured)
        throw new Error("Connect a Convex deployment to enable sign-in.");
    return (browserClient ??= createWebAuthClient());
}

export async function getConvexAccessToken() {
    const client = getAuthClient();
    const { data, error } = await client.convex.token();
    if (error || !data?.token) throw new Error("Please sign in to continue.");
    return data.token;
}
