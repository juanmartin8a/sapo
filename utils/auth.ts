export function isAnonymousSessionUser(user: unknown) {
    if (typeof user !== "object" || user === null) {
        return false;
    }

    const record = user as Record<string, unknown>;
    return record.isAnonymous === true;
}

export function getSessionUserAuthState(user: unknown) {
    if (typeof user !== "object" || user === null) {
        return "signed_out" as const;
    }

    return isAnonymousSessionUser(user) ? "anonymous" : "authenticated";
}
