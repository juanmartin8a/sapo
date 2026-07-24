import { describe, expect, it } from "@jest/globals";

import {
    getAuthoritativeAuthStatus,
    getSessionUserAuthState,
} from "@/utils/auth";

const getStatus = (
    overrides: Partial<Parameters<typeof getAuthoritativeAuthStatus>[0]> = {}
) => getAuthoritativeAuthStatus({
    sessionUserState: "signed_out",
    currentUserState: "missing",
    isSessionPending: false,
    isSessionRefetching: false,
    preserveSignedOutDuringRefresh: false,
    ...overrides,
});

describe("authoritative auth state", () => {
    it("distinguishes anonymous users from authenticated users", () => {
        expect(getSessionUserAuthState(null)).toBe("signed_out");
        expect(getSessionUserAuthState({ isAnonymous: true })).toBe("anonymous");
        expect(getSessionUserAuthState({ id: "user-a" })).toBe("authenticated");
    });

    it("keeps the initial session load in checking state", () => {
        expect(getStatus({
            isSessionPending: true,
            isSessionRefetching: true,
        })).toBe("checking");
    });

    it("keeps confirmed signed-out UI stable during a background refetch", () => {
        expect(getStatus({
            isSessionPending: true,
            isSessionRefetching: true,
            preserveSignedOutDuringRefresh: true,
        })).toBe("signed_out");
    });

    it("does not reuse authenticated state when session data is absent", () => {
        expect(getStatus({
            isSessionPending: true,
            isSessionRefetching: true,
            preserveSignedOutDuringRefresh: false,
        })).toBe("checking");
    });

    it("waits for Convex to confirm a session user", () => {
        expect(getStatus({
            sessionUserState: "authenticated",
            currentUserState: "checking",
        })).toBe("checking");
        expect(getStatus({
            sessionUserState: "authenticated",
            currentUserState: "authenticated",
        })).toBe("authenticated");
    });

    it("treats anonymous and Convex-rejected sessions as signed out", () => {
        expect(getStatus({ sessionUserState: "anonymous" })).toBe("signed_out");
        expect(getStatus({
            sessionUserState: "authenticated",
            currentUserState: "missing",
        })).toBe("signed_out");
    });
});
