import { createContext, createEffect, createSignal, onSettled, useContext } from "solid-js";
import type { JSX } from "@solidjs/web";
import { createLocalModelStore } from "@/stores/localModelStore";
import { LOCAL_INPUT_LIMIT } from "@/lib/local-models/config";
import { createTranslationStore } from "@/stores/translationStore";
import { useAuthState } from "./AuthProvider";
import { loadPreferences, savePreferences } from "@/lib/preferences";
import { watchPwaThemeColor } from "@/lib/site-theme";
import { createPwaStore } from "@/stores/pwaStore";
import { DEFAULT_SUBSCRIPTION_PLAN_LIMITS } from "@/constants/translation";
import { watchRespellAccess } from "./respell-access";

function createAppState(pwa: boolean) {
    const localModels = createLocalModelStore(() => translation.stopStream());
    const translation = createTranslationStore({
        enabled: () => localModels.state.enabled,
        identity: localModels.identity,
        translate: localModels.translate,
    });
    const auth = useAuthState();
    const plan = () =>
        DEFAULT_SUBSCRIPTION_PLAN_LIMITS[auth.state.hasActiveSubscription ? "polyglot" : "free"];
    return {
        translation,
        localModels,
        auth,
        plan,
        inputLimit: () =>
            translation.usesLocalModel()
                ? LOCAL_INPUT_LIMIT
                : translation.state.operation === "respell"
                  ? plan().respell_input_char_limit
                  : plan().translate_input_char_limit,
        respellLocked: () =>
            translation.state.operation === "respell" && auth.state.hasActiveSubscription === false,
        isPwa: pwa,
        basePath: pwa ? ("/pwa" as const) : ("" as const),
        pwa: createPwaStore(pwa),
    };
}
const AppContext = createContext<
    ReturnType<typeof createAppState> & { preferencesReady: () => boolean }
>();

export default function AppProvider(props: { children: JSX.Element; pwa?: boolean }) {
    const [preferencesReady, setPreferencesReady] = createSignal(false);
    const app = { ...createAppState(Boolean(props.pwa)), preferencesReady };

    watchRespellAccess(app.auth.state, app.translation);

    onSettled(() => {
        app.translation.setPreferences(loadPreferences());
        app.localModels.initialize();
        setPreferencesReady(true);
        const disposePwa = app.pwa.initialize();
        const disposeThemeColor = app.isPwa ? watchPwaThemeColor() : undefined;
        return () => {
            app.translation.stopStream();
            app.localModels.dispose();
            disposePwa();
            disposeThemeColor?.();
        };
    });
    createEffect(
        () => app.auth.state.userId,
        (userId, previousId) => {
            if (previousId && userId !== previousId && !app.translation.usesLocalModel())
                app.translation.clear();
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
