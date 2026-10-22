export function tursoConfig(urlValue: string | undefined, token: string | undefined) {
    let url: URL;
    try {
        url = new URL(urlValue ?? "");
    } catch {
        throw new Error("TURSO_DATABASE_URL must be a libsql:// or https:// database URL.");
    }
    if (
        !["libsql:", "https:"].includes(url.protocol) ||
        !url.hostname ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !["", "/"].includes(url.pathname)
    ) {
        throw new Error(
            "TURSO_DATABASE_URL must be a remote database URL without credentials or parameters.",
        );
    }
    if (!token?.trim()) throw new Error("TURSO_AUTH_TOKEN is required.");
    return { url: `https://${url.host}`, authToken: token };
}
