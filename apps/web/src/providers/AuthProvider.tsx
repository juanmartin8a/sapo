import { createContext, onSettled, useContext } from "solid-js";
import type { JSX } from "@solidjs/web";
import { createAuthStore } from "@/stores/authStore";
import { isAuthSessionStorageChange } from "@/lib/auth-storage";

const AuthContext = createContext<ReturnType<typeof createAuthStore>>();

export default function AuthProvider(props: { children: JSX.Element }) {
    const auth = createAuthStore();

    onSettled(() => {
        void auth.refreshSession();
        const refresh = () => {
            if (document.visibilityState === "visible") void auth.refreshSession();
        };
        const storage = (event: StorageEvent) => {
            if (isAuthSessionStorageChange(event)) void auth.handleSessionChange();
        };
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", refresh);
        window.addEventListener("storage", storage);
        return () => {
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", refresh);
            window.removeEventListener("storage", storage);
            auth.dispose();
        };
    });

    return <AuthContext value={auth}>{props.children}</AuthContext>;
}

export function useAuthState() {
    const auth = useContext(AuthContext);
    if (!auth) throw new Error("useAuthState must be used within AuthProvider");
    return auth;
}
