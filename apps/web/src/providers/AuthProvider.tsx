import {
    createContext,
    createEffect,
    createSignal,
    onSettled,
    untrack,
    useContext,
} from "solid-js";
import type { JSX } from "@solidjs/web";
import { createAuthStore } from "@/stores/authStore";
import { isAuthSessionStorageChange } from "@/lib/auth-storage";
import type { AuthBootstrap } from "@/lib/auth-bootstrap";

const AuthContext = createContext<ReturnType<typeof createAuthStore>>();

export default function AuthProvider(props: {
    children: JSX.Element;
    initialAuth?: AuthBootstrap;
}) {
    const auth = createAuthStore(untrack(() => props.initialAuth));
    const [syncChannel, setSyncChannel] = createSignal<BroadcastChannel | null>(null);

    createEffect(
        () => ({
            channel: syncChannel(),
            userId: auth.state.status === "checking" ? undefined : auth.state.userId,
            revision: auth.state.sessionRevision,
        }),
        ({ channel, userId }) => {
            if (userId !== undefined) channel?.postMessage({ userId });
        },
    );

    onSettled(() => {
        void auth.initialize();
        const refresh = () => {
            if (document.visibilityState === "visible") void auth.refreshIfStale();
        };
        const storage = (event: StorageEvent) => {
            if (isAuthSessionStorageChange(event)) void auth.handleSessionChange();
        };
        const channel =
            typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("sapo-auth");
        setSyncChannel(channel);
        if (channel)
            channel.onmessage = (event: MessageEvent<unknown>) => {
                const data = event.data as { userId?: unknown } | null;
                if (
                    data &&
                    (data.userId === null || typeof data.userId === "string") &&
                    (data.userId !== auth.state.userId ||
                        (data.userId === null && auth.state.status === "checking"))
                )
                    void auth.handleSessionChange(data.userId);
            };
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", refresh);
        window.addEventListener("storage", storage);
        return () => {
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", refresh);
            window.removeEventListener("storage", storage);
            channel?.close();
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
