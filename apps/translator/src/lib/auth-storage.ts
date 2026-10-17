type AuthStorageChange = Pick<StorageEvent, "key" | "oldValue" | "newValue">;

function sessionTokens(value: string | null): string {
    const cookies: unknown = JSON.parse(value ?? "{}");
    if (!cookies || typeof cookies !== "object" || Array.isArray(cookies))
        throw new Error("Invalid auth cookie storage");
    return JSON.stringify(
        Object.entries(cookies)
            .filter(([name]) => name.endsWith(".session_token"))
            .map(([name, cookie]) => [name, cookie?.value])
            .sort(([left], [right]) => left.localeCompare(right)),
    );
}

// Convex renews its JWT cookie during session reads. Refreshing on those writes
// makes two tabs continually wake each other; only session identity changes
// need a new authoritative account check. Stored values never grant access.
export function isAuthSessionStorageChange(event: AuthStorageChange): boolean {
    if (event.key === null) return true; // localStorage.clear() in another tab.
    if (event.key !== "better-auth_cookie" || event.oldValue === event.newValue)
        return false;
    try {
        return sessionTokens(event.oldValue) !== sessionTokens(event.newValue);
    } catch {
        // Revalidate rather than trust malformed or externally changed storage.
        return true;
    }
}
