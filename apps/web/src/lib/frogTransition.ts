// Each router owns its transition coordinator; SSR requests never share state.
const frogRoutes = new Set(["/about", "/support", "/contact-us", "/delete-account"]);
const normalize = (path: string) => path.replace(/\/$/, "") || "/";
const transitionClass = "sapo-frog-view-transitioning";
const IMAGE_WAIT_MS = 200;

export async function waitForFrogImages(): Promise<boolean> {
    const images = Array.from(
        document.querySelectorAll<HTMLImageElement>(".sapo-frog-transition img"),
    ).filter((image) => image.getClientRects().length > 0);
    if (!images.length) return false;

    const decoded = Promise.all(
        images.map((image) => {
            // View transitions can suspend rendering before lazy images are loaded.
            image.loading = "eager";
            return image.decode();
        }),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            decoded.then(
                () => true,
                () => false,
            ),
            new Promise<boolean>((resolve) => {
                timer = setTimeout(() => resolve(false), IMAGE_WAIT_MS);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}
export function createFrogTransitions() {
    let pending = Promise.resolve();
    let current: ViewTransition | undefined;
    function begin() {
        let finish!: () => void;
        pending = new Promise<void>((resolve) => {
            finish = resolve;
        });
        return finish;
    }
    async function wait() {
        let transition: Promise<void>;
        do {
            transition = pending;
            await transition;
        } while (transition !== pending);
    }
    function run(update: () => Promise<void>, from?: string, to?: string) {
        if (typeof document === "undefined") return update();
        current?.skipTransition();
        current = undefined;
        document.documentElement.classList.remove(transitionClass);
        if (
            !from ||
            !to ||
            normalize(from) === normalize(to) ||
            !frogRoutes.has(normalize(from)) ||
            !frogRoutes.has(normalize(to)) ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
            !document.startViewTransition
        )
            return update();
        const release = begin();
        document.documentElement.classList.add(transitionClass);
        const transition = document.startViewTransition(async () => {
            await update();
            if (!(await waitForFrogImages())) transition.skipTransition();
        });
        // Skipping a transition rejects ready while navigation still completes.
        void transition.ready.catch(() => {});
        current = transition;
        const finish = () => {
            if (current === transition) {
                document.documentElement.classList.remove(transitionClass);
                current = undefined;
            }
            release();
        };
        void transition.finished.then(finish, finish);
        return transition.updateCallbackDone;
    }
    return { begin, wait, run };
}
export type FrogTransitions = ReturnType<typeof createFrogTransitions>;
