import {
    createContext,
    createEffect,
    createSignal,
    onSettled,
    useContext,
} from "solid-js";
import type { JSX } from "@solidjs/web";
import { createTranslationStore } from "@/stores/translationStore";
import { createAuthStore } from "@/stores/authStore";
import { loadPreferences, savePreferences } from "@/lib/preferences";
import { createPwaStore } from "@/stores/pwaStore";
import { isAuthSessionStorageChange } from "@/lib/auth-storage";

function createAppState() {
    return {
        translation: createTranslationStore(),
        auth: createAuthStore(),
        pwa: createPwaStore(),
    };
}
const AppContext = createContext<ReturnType<typeof createAppState>>();

export default function AppProvider(props: { children: JSX.Element }) {
    const app = createAppState();
    const [preferencesReady, setPreferencesReady] = createSignal(false);

    onSettled(() => {
        app.translation.setPreferences(loadPreferences());
        setPreferencesReady(true);
        void app.auth.refreshSession();
        const disposePwa = app.pwa.initialize();
        const refresh = () => {
            if (document.visibilityState === "visible")
                void app.auth.refreshSession();
        };
        const storage = (event: StorageEvent) => {
            if (isAuthSessionStorageChange(event)) {
                void app.auth.refreshSession();
            }
        };
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", refresh);
        window.addEventListener("storage", storage);
        return () => {
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", refresh);
            window.removeEventListener("storage", storage);
            app.translation.stopStream();
            app.auth.dispose();
            disposePwa();
        };
    });
    createEffect(
        () => app.auth.state.userId,
        (userId, previousId) => {
            if (previousId && userId !== previousId) app.translation.clear();
        },
    );
    createEffect(
        () => ({
            ready: preferencesReady(),
            operation: app.translation.state.operation,
            sourceLanguage: app.translation.state.sourceLanguage,
            targetLanguage: app.translation.state.targetLanguage,
            respellLanguage: app.translation.state.respellLanguage,
            translateThenRespell: app.translation.state.translateThenRespell,
            singleScreen: app.translation.state.singleScreen,
        }),
        ({ ready, ...preferences }) => {
            if (ready) savePreferences(preferences);
        },
    );

    return <AppContext value={app}>{props.children}</AppContext>;
}

export function useAppState() {
    const app = useContext(AppContext);
    if (!app) throw new Error("useAppState must be used within AppProvider");
    return app;
}
