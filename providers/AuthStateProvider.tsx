import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { useQuery } from "convex/react";
import { AppState } from "react-native";

import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import {
    getAuthoritativeAuthStatus,
    getSessionUserAuthState,
    type AuthStatus,
} from "@/utils/auth";

type AuthStateContextValue = {
    status: AuthStatus;
    userId: string | null;
    sessionId: string | null;
    email: string | null;
    isRefreshing: boolean;
    hasUnsupportedSession: boolean;
};

const AuthStateContext = createContext<AuthStateContextValue | null>(null);

export default function AuthStateProvider({ children }: PropsWithChildren) {
    const [preserveSignedOutDuringRefresh, setPreserveSignedOutDuringRefresh] = useState(false);
    const refreshRunRef = useRef(0);
    const {
        data: session,
        isPending: isSessionPending,
        isRefetching: isSessionRefetching,
        refetch,
    } = authClient.useSession();
    const sessionUserState = getSessionUserAuthState(session?.user);
    const shouldValidateCurrentUser = sessionUserState === "authenticated";
    const currentUser = useQuery(
        api.auth.getCurrentUser,
        shouldValidateCurrentUser ? {} : "skip"
    );
    const sessionUserId = session?.user?.id ?? null;
    const currentUserState = !shouldValidateCurrentUser || currentUser === null
        ? "missing" as const
        : currentUser === undefined || String(currentUser._id) !== sessionUserId
            ? "checking" as const
            : "authenticated" as const;
    const status = getAuthoritativeAuthStatus({
        sessionUserState,
        currentUserState,
        isSessionPending,
        isSessionRefetching,
        preserveSignedOutDuringRefresh,
    });
    const hasUnsupportedSession = Boolean(
        session &&
        !isSessionPending &&
        (sessionUserState !== "authenticated" || currentUser === null)
    );
    const userId = status === "authenticated" ? sessionUserId : null;
    const email = status === "authenticated"
        ? currentUser?.email ?? session?.user?.email ?? null
        : null;

    useEffect(() => {
        const appStateSubscription = AppState.addEventListener("change", (nextState) => {
            if (nextState === "active") {
                const refreshRun = refreshRunRef.current + 1;
                const shouldPreserveSignedOut = status === "signed_out";
                refreshRunRef.current = refreshRun;

                if (shouldPreserveSignedOut) {
                    setPreserveSignedOutDuringRefresh(true);
                }

                void refetch()
                    .catch((error) => {
                        if (__DEV__) {
                            console.warn("Session refresh failed", error);
                        }
                    })
                    .finally(() => {
                        if (refreshRunRef.current === refreshRun && shouldPreserveSignedOut) {
                            setPreserveSignedOutDuringRefresh(false);
                        }
                    });
            }
        });

        return () => {
            appStateSubscription.remove();
        };
    }, [refetch, status]);

    return (
        <AuthStateContext.Provider
            value={{
                status,
                userId,
                sessionId: session?.session?.id ?? null,
                email,
                isRefreshing: isSessionRefetching || currentUserState === "checking",
                hasUnsupportedSession,
            }}
        >
            {children}
        </AuthStateContext.Provider>
    );
}

export function useAuthState() {
    const authState = useContext(AuthStateContext);

    if (!authState) {
        throw new Error("useAuthState must be used within AuthStateProvider");
    }

    return authState;
}
