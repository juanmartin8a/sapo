import { createAuthClient } from "better-auth/client";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { decodeJwt } from "jose";
import { AUTH_BASE_PATH } from "./auth-bootstrap";

let cachedToken: { value: string; userId: string; expiresAtMs: number } | null = null;
let tokenPromise: Promise<string> | null = null;
let tokenGeneration = 0;

export function clearConvexAccessToken() {
    cachedToken = null;
    tokenPromise = null;
    ++tokenGeneration;
}

export const isAuthConfigured = Boolean(
    import.meta.env.VITE_CONVEX_SITE_URL && import.meta.env.VITE_CONVEX_URL,
);

function createWebAuthClient() {
    return createAuthClient({
        baseURL: `${window.location.origin}${AUTH_BASE_PATH}`,
        basePath: AUTH_BASE_PATH,
        plugins: [convexClient()],
        fetchOptions: {
            plugins: [
                {
                    id: "sapo-session-cache",
                    name: "SAPO session cache",
                    hooks: {
                        onSuccess(context) {
                            const path = new URL(context.request.url).pathname;
                            if (
                                path.endsWith("/sign-out") ||
                                (path.endsWith("/get-session") &&
                                    context.data?.user?.id !== cachedToken?.userId)
                            )
                                clearConvexAccessToken();
                        },
                    },
                },
            ],
        },
    });
}

// Cookies stay HttpOnly. Construct a separate client only in the browser.
let browserClient: ReturnType<typeof createWebAuthClient> | undefined;

export function getAuthClient() {
    if (typeof window === "undefined") throw new Error("Authentication is browser-only.");
    if (!isAuthConfigured) throw new Error("Connect a Convex deployment to enable sign-in.");
    return (browserClient ??= createWebAuthClient());
}

export async function getConvexAccessToken(forceRefresh = false) {
    if (!forceRefresh && cachedToken && cachedToken.expiresAtMs > Date.now() + 30_000)
        return cachedToken.value;
    if (tokenPromise) return tokenPromise;
    const run = tokenGeneration;
    tokenPromise = (async () => {
        const { data, error } = await getAuthClient().convex.token();
        if (error || !data?.token)
            throw Object.assign(new Error("Please sign in to continue."), {
                status: error?.status,
            });
        // Decoding controls refresh timing only. Convex verifies the token itself.
        const claims = decodeJwt(data.token);
        if (run !== tokenGeneration) throw new Error("Your account changed. Please try again.");
        if (claims.sub && claims.exp)
            cachedToken = {
                value: data.token,
                userId: claims.sub,
                expiresAtMs: claims.exp * 1000,
            };
        return data.token;
    })().finally(() => {
        if (run === tokenGeneration) tokenPromise = null;
    });
    return tokenPromise;
}
