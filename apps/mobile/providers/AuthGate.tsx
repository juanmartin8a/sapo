import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "expo-router";

import { signOutCurrentSession } from "@/lib/auth-session";
import { APP_ROUTES } from "@/constants/routes";
import { useAuthState } from "@/providers/AuthStateProvider";
import { useSignInStore } from "@/stores/signInStore";

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
                void signOutCurrentSession().catch((error) => {
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
        useSignInStore.getState().reset();

        if (pathname === APP_ROUTES.AUTH || pathname === APP_ROUTES.DEMO_ACCESS) {
            router.dismissTo(APP_ROUTES.HOME);
        }
    }, [hasUnsupportedSession, pathname, router, sessionId, status]);

    return null;
}
