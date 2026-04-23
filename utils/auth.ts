function readAnonymousFlag(user: unknown) {
    if (typeof user !== "object" || user === null) {
        return false;
    }

    const record = user as Record<string, unknown>;

    if (record.isAnonymous === true) {
        return true;
    }

    if (typeof record.user !== "object" || record.user === null) {
        return false;
    }

    return (record.user as { isAnonymous?: unknown }).isAnonymous === true;
}

export function isAnonymousSessionUser(user: unknown) {
    return readAnonymousFlag(user);
}

export function getSessionUserAuthState(user: unknown) {
    if (typeof user !== "object" || user === null) {
        return "signed_out" as const;
    }

    return isAnonymousSessionUser(user) ? "anonymous" : "authenticated";
}
