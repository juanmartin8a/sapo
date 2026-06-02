import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { usePathname, useRouter } from "expo-router";

import { authClient } from "@/clients/auth-client";
import { api } from "@/convex/_generated/api";

export default function AuthGate() {
    const pathname = usePathname();
    const router = useRouter();
    const { data: session, isPending } = authClient.useSession();
    const currentUser = useQuery(api.auth.getCurrentUser, session ? {} : "skip");
    const isCheckingCurrentUser = Boolean(session) && currentUser === undefined;
    const hasSignedInUser = Boolean(session && currentUser);
    const hasUnsupportedSession = Boolean(session && currentUser === null);
    const signedOutSessionIdRef = useRef<string | null>(null);
    const sessionUserId = session?.user?.id ?? null;

    useEffect(() => {
        if (isPending || isCheckingCurrentUser) {
            return;
        }

        if (hasUnsupportedSession) {
            const sessionKey = sessionUserId ?? "unknown";

            if (signedOutSessionIdRef.current !== sessionKey) {
                signedOutSessionIdRef.current = sessionKey;
                void authClient.signOut().catch((error) => {
                    if (__DEV__) {
                        console.warn("Unsupported session sign-out failed", error);
                    }
                });
            }

            return;
        }

        if (!hasSignedInUser) {
            return;
        }

        signedOutSessionIdRef.current = null;

        if (pathname === "/auth") {
            router.replace("/");
        }
    }, [hasSignedInUser, hasUnsupportedSession, isCheckingCurrentUser, isPending, pathname, router, sessionUserId]);

    return null;
}
