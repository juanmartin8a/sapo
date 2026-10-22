import {
    HeadContent,
    Outlet,
    Scripts,
    createRootRouteWithContext,
    Link,
    useLocation,
} from "@tanstack/solid-router";
import type { JSX } from "@solidjs/web";
import { isTranslatorPath, translatorBase } from "@/lib/translator-paths";
import AuthProvider from "@/providers/AuthProvider";
import { loadInitialAuth } from "@/lib/auth-initial";
import type { FrogTransitions } from "@/lib/frogTransition";
import baseCss from "@/styles/base.css?url";
import siteCss from "@/styles/site.css?url";

export const Route = createRootRouteWithContext<{ frogTransitions: FrogTransitions }>()({
    beforeLoad: async () => ({ initialAuth: await loadInitialAuth() }),
    head: () => ({
        meta: [
            {
                name: "viewport",
                content: "width=device-width, initial-scale=1, viewport-fit=cover",
            },
            { name: "referrer", content: "same-origin" },
        ],
        links: [baseCss, siteCss].map((href) => ({ rel: "stylesheet", href })),
    }),
    component: RootContent,
    shellComponent: RootDocument,
    notFoundComponent: NotFoundPage,
    errorComponent: ErrorPage,
});

function RootContent() {
    const context = Route.useRouteContext();
    return (
        <AuthProvider initialAuth={context().initialAuth}>
            <Outlet />
        </AuthProvider>
    );
}

function ErrorPage() {
    const location = useLocation();
    return (
        <main class="message-screen">
            <h1>Something went wrong.</h1>
            <p>Please refresh and try again.</p>
            <a href={`${translatorBase(location().pathname)}/`}>Back to SAPO</a>
        </main>
    );
}

function NotFoundPage() {
    const location = useLocation();
    const home = () =>
        isTranslatorPath(location().pathname) ? `${translatorBase(location().pathname)}/` : "/";
    return (
        <main class="message-screen">
            <h1>Page not found.</h1>
            <Link to={home()}>Back to SAPO</Link>
        </main>
    );
}

function RootDocument(props: { children: JSX.Element }) {
    return (
        <html lang="en">
            <head>
                <meta charset="utf-8" />
                <HeadContent />
            </head>
            <body>
                {props.children}
                <Scripts />
            </body>
        </html>
    );
}
