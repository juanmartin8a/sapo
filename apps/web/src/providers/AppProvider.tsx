import { createContext, createEffect, createSignal, onSettled, useContext } from "solid-js";
import type { JSX } from "@solidjs/web";
import { createTranslationStore } from "@/stores/translationStore";
import { useAuthState } from "./AuthProvider";
import { loadPreferences, savePreferences } from "@/lib/preferences";
import { createPwaStore } from "@/stores/pwaStore";

function createAppState(pwa: boolean) {
    return {
        translation: createTranslationStore(),
        auth: useAuthState(),
        isPwa: pwa,
        basePath: pwa ? ("/pwa" as const) : ("/app" as const),
        pwa: createPwaStore(pwa),
    };
}
const AppContext = createContext<
    ReturnType<typeof createAppState> & { preferencesReady: () => boolean }
>();

export default function AppProvider(props: { children: JSX.Element; pwa?: boolean }) {
    const [preferencesReady, setPreferencesReady] = createSignal(false);
    const app = { ...createAppState(Boolean(props.pwa)), preferencesReady };

    onSettled(() => {
        app.translation.setPreferences(loadPreferences());
        setPreferencesReady(true);
        const disposePwa = app.pwa.initialize();
        return () => {
            app.translation.stopStream();
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
