export function getSessionUserAuthState(user: unknown) {
    if (typeof user !== "object" || user === null) {
        return "signed_out" as const;
    }

    return "authenticated" as const;
}
