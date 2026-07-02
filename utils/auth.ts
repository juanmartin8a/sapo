export function getSessionUserAuthState(user: unknown) {
    if (typeof user !== "object" || user === null) {
        return "signed_out" as const;
    }

    if ((user as { isAnonymous?: unknown }).isAnonymous === true) {
        return "anonymous" as const;
    }

    return "authenticated" as const;
}
