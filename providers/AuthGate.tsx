import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "expo-router";

import { authClient } from "@/lib/auth-client";
import { APP_ROUTES } from "@/constants/routes";
import { useAuthState } from "@/providers/AuthStateProvider";

export default function AuthGate() {
    const pathname = usePathname();
    const router = useRouter();
    const { status, hasUnsupportedSession, sessionId } = useAuthState();
    const signedOutSessionIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (status === "checking") {
            return;
        }

        if (hasUnsupportedSession) {
            const sessionKey = sessionId ?? "unknown";

            if (signedOutSessionIdRef.current !== sessionKey) {
                signedOutSessionIdRef.current = sessionKey;
                void authClient.signOut().catch((error) => {
                    if (signedOutSessionIdRef.current === sessionKey) {
                        signedOutSessionIdRef.current = null;
                    }

                    if (__DEV__) {
                        console.warn("Unsupported session sign-out failed", error);
                    }
                });
            }

            return;
        }

        if (status !== "authenticated") {
            return;
        }

        signedOutSessionIdRef.current = null;

        if (pathname === APP_ROUTES.AUTH) {
            router.dismissTo(APP_ROUTES.HOME);
        }
    }, [hasUnsupportedSession, pathname, router, sessionId, status]);

    return null;
}
