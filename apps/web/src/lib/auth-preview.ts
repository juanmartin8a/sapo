export type AccountPreview = {
    userId: string;
    name: string | null;
    expiresAtMs: number;
};

type SessionCache = {
    getSessionData: () => unknown;
    getCookie: () => string;
};

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function identifier(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= 2048;
}

// This is an untrusted display hint, never evidence of authentication or access.
// Read through Better Auth so its cookie expiry handling remains authoritative
// for which stored cookies are still sent. Do not create another persisted cache.
export function readAccountPreview(cache: SessionCache, now = Date.now()): AccountPreview | null {
    try {
        const data = record(cache.getSessionData());
        const user = record(data?.user);
        const session = record(data?.session);
        if (
            !user ||
            !session ||
            !identifier(user.id) ||
            session.userId !== user.id ||
            !identifier(session.token) ||
            typeof session.expiresAt !== "string" ||
            (user.name != null && (typeof user.name !== "string" || user.name.length > 256))
        )
            return null;
        const expiresAtMs = Date.parse(session.expiresAt);
        if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) return null;

        // Cache and cookie writes can belong to different sessions during OAuth
        // or cross-tab account changes. Only show a preview when they agree.
        const tokens = cache
            .getCookie()
            .split(";")
            .flatMap((cookie) => {
                const separator = cookie.indexOf("=");
                const name = cookie.slice(0, separator).trim();
                if (
                    separator < 0 ||
                    !["better-auth.session_token", "__Secure-better-auth.session_token"].includes(
                        name,
                    )
                )
                    return [];
                return [decodeURIComponent(cookie.slice(separator + 1).trim())];
            });
        // Better Auth signs its cookie as token.signature; /get-session returns
        // the raw token. This comparison associates the hint, not verifies it.
        const token = session.token;
        if (
            tokens.length !== 1 ||
            !(
                tokens[0] === token ||
                (tokens[0].startsWith(`${token}.`) && tokens[0].length > token.length + 1)
            )
        )
            return null;
        return {
            userId: user.id,
            name: typeof user.name === "string" ? user.name.trim() || null : null,
            expiresAtMs,
        };
    } catch {
        // Corrupt or unavailable storage must not block a real session check.
        return null;
    }
}
