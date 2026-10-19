import {
    HeadContent,
    Outlet,
    Scripts,
    createRootRouteWithContext,
    Link,
    useLocation,
} from "@tanstack/solid-router";
import type { JSX } from "@solidjs/web";
import AuthProvider from "@/providers/AuthProvider";
import type { FrogTransitions } from "@/lib/frogTransition";
import baseCss from "@/styles/base.css?url";
import siteCss from "@/styles/site.css?url";
import translatorCss from "@/styles/translator.css?url";

export const Route = createRootRouteWithContext<{ frogTransitions: FrogTransitions }>()({
    head: () => ({
        meta: [
            {
                name: "viewport",
                content: "width=device-width, initial-scale=1, viewport-fit=cover",
            },
            { name: "referrer", content: "same-origin" },
        ],
        links: [baseCss, siteCss, translatorCss].map((href) => ({ rel: "stylesheet", href })),
    }),
    component: () => (
        <AuthProvider>
            <Outlet />
        </AuthProvider>
    ),
    shellComponent: RootDocument,
    notFoundComponent: NotFoundPage,
    errorComponent: () => (
        <main class="message-screen">
            <h1>Something went wrong.</h1>
            <p>Please refresh and try again.</p>
            <a href="/app/">Back to SAPO</a>
        </main>
    ),
});

function NotFoundPage() {
    const location = useLocation();
    const home = () => (/^\/app(?:\/|$)/.test(location().pathname) ? "/app/" : "/");
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
