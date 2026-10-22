import { AUTH_BASE_PATH } from "./auth-bootstrap";
import { readAccountPreview } from "./auth-preview";

// One-time migration from the former cross-domain localStorage transport.
// New sessions are stored exclusively in HttpOnly, first-party cookies.
function legacyCookies() {
    const cookies = JSON.parse(localStorage.getItem("better-auth_cookie") ?? "{}");
    return Object.entries(cookies as Record<string, { value?: unknown; expires?: string }>)
        .filter(
            ([name, cookie]) =>
                /^(?:__Secure-)?better-auth\./.test(name) &&
                typeof cookie?.value === "string" &&
                (!cookie.expires || Date.parse(cookie.expires) > Date.now()),
        )
        .map(([name, cookie]) => `${name}=${cookie.value}`)
        .join("; ");
}

export function readLegacyAccountPreview() {
    return readAccountPreview({
        getSessionData: () =>
            JSON.parse(localStorage.getItem("better-auth_session_data") ?? "null"),
        getCookie: legacyCookies,
    });
}

export function clearLegacyAuth() {
    try {
        localStorage.removeItem("better-auth_cookie");
        localStorage.removeItem("better-auth_session_data");
    } catch {
        // Browser storage may be disabled. Cookie auth does not depend on it.
    }
}

export async function migrateLegacySession() {
    let cookies: string;
    try {
        cookies = legacyCookies();
    } catch {
        return false;
    }
    if (!/(?:^|; )(?:__Secure-)?better-auth\.session_token=.+/.test(cookies)) return false;
    const response = await fetch(`${AUTH_BASE_PATH}/migrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookies }),
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Couldn’t restore your session. Please try again.");
    const data = (await response.json()) as { migrated?: boolean };
    clearLegacyAuth();
    return data.migrated === true;
}
