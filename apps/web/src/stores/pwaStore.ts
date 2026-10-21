import { createStore } from "solid-js";

interface InstallPrompt extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function createPwaStore(enabled: boolean) {
    const [state, setState] = createStore({
        online: true,
        installable: false,
        installed: false,
        updateAvailable: false,
    });
    let prompt: InstallPrompt | null = null;
    let registration: ServiceWorkerRegistration | undefined;

    return {
        state,
        initialize: () => {
            const network = () =>
                setState((draft) => {
                    draft.online = navigator.onLine;
                });
            const install = (event: Event) => {
                event.preventDefault();
                prompt = event as InstallPrompt;
                setState((draft) => {
                    draft.installable = true;
                });
            };
            const installed = () => {
                prompt = null;
                setState((draft) => {
                    draft.installed = true;
                    draft.installable = false;
                });
            };
            const checkWaiting = () => {
                if (registration?.waiting && navigator.serviceWorker.controller)
                    setState((draft) => {
                        draft.updateAvailable = true;
                    });
            };
            const standalone = window.matchMedia("(display-mode: standalone)");
            network();
            setState((draft) => {
                draft.installed = enabled && standalone.matches;
            });
            window.addEventListener("online", network);
            window.addEventListener("offline", network);
            if (enabled) {
                window.addEventListener("beforeinstallprompt", install);
                window.addEventListener("appinstalled", installed);
            }
            let disposed = false;
            // Retire the previous /app worker without touching other registrations.
            if ("serviceWorker" in navigator) {
                void navigator.serviceWorker
                    .getRegistration("/app/")
                    .then((legacy) => {
                        if (legacy?.scope === `${window.location.origin}/app/`)
                            return legacy.unregister();
                    })
                    .catch(() => {});
            }
            if (enabled && import.meta.env.PROD && "serviceWorker" in navigator) {
                void navigator.serviceWorker
                    .register("/pwa/sw.js", { scope: "/pwa/" })
                    .then((result) => {
                        if (disposed) return;
                        registration = result;
                        checkWaiting();
                        result.onupdatefound = () => {
                            if (result.installing) result.installing.onstatechange = checkWaiting;
                        };
                    })
                    .catch(() => {
                        /* The app remains usable without installation. */
                    });
            }
            return () => {
                disposed = true;
                window.removeEventListener("online", network);
                window.removeEventListener("offline", network);
                window.removeEventListener("beforeinstallprompt", install);
                window.removeEventListener("appinstalled", installed);
                if (registration) registration.onupdatefound = null;
            };
        },
        install: async () => {
            if (!prompt) return;
            const current = prompt;
            prompt = null;
            setState((draft) => {
                draft.installable = false;
            });
            await current.prompt();
            await current.userChoice;
        },
        update: () => {
            if (!registration?.waiting) return;
            navigator.serviceWorker.addEventListener(
                "controllerchange",
                () => window.location.reload(),
                { once: true },
            );
            registration.waiting.postMessage("SKIP_WAITING");
        },
    };
}
