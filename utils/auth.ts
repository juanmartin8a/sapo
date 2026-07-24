export function getSessionUserAuthState(user: unknown) {
    if (typeof user !== "object" || user === null) {
        return "signed_out" as const;
    }

    if ((user as { isAnonymous?: unknown }).isAnonymous === true) {
        return "anonymous" as const;
    }

    return "authenticated" as const;
}

export type AuthStatus = "checking" | "signed_out" | "authenticated";

type CurrentUserState = "checking" | "missing" | "authenticated";

export function getAuthoritativeAuthStatus(args: {
    sessionUserState: ReturnType<typeof getSessionUserAuthState>;
    currentUserState: CurrentUserState;
    isSessionPending: boolean;
    isSessionRefetching: boolean;
    preserveSignedOutDuringRefresh: boolean;
}): AuthStatus {
    if (args.isSessionPending) {
        const isConfirmedSignedOutRefresh =
            args.isSessionRefetching &&
            args.sessionUserState === "signed_out" &&
            args.preserveSignedOutDuringRefresh;

        return isConfirmedSignedOutRefresh ? "signed_out" : "checking";
    }

    if (args.sessionUserState !== "authenticated") {
        return "signed_out";
    }

    if (args.currentUserState === "checking") {
        return "checking";
    }

    return args.currentUserState === "authenticated"
        ? "authenticated"
        : "signed_out";
}
