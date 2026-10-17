import { createRouter } from "@tanstack/solid-router";
import { routeTree } from "./routeTree.gen";
import { createFrogTransitions } from "./lib/frogTransition";
export function getRouter() {
    const frogTransitions = createFrogTransitions();
    const router = createRouter({
        routeTree,
        scrollRestoration: true,
        trailingSlash: "always",
        context: { frogTransitions },
    });
    router.startViewTransition = (update) =>
        frogTransitions.run(
            update,
            router.stores.resolvedLocation.get()?.pathname,
            router.latestLocation.pathname,
        );
    return router;
}
declare module "@tanstack/solid-router" {
    interface Register {
        router: ReturnType<typeof getRouter>;
    }
}
