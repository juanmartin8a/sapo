import {
    HeadContent,
    Outlet,
    Scripts,
    createRootRoute,
    Link,
} from "@tanstack/solid-router";
import type { JSX } from "@solidjs/web";
import AppProvider from "@/providers/AppProvider";
import appCss from "@/styles.css?url";

export const Route = createRootRoute({
    head: () => ({
        meta: [
            {
                name: "viewport",
                content:
                    "width=device-width, initial-scale=1, viewport-fit=cover",
            },
            { title: "S A P O — Translate & Respell" },
            {
                name: "description",
                content: "Translate and respell text with SAPO.",
            },
            { name: "theme-color", content: "#ffffff" },
            { name: "referrer", content: "same-origin" },
            { name: "apple-mobile-web-app-capable", content: "yes" },
            {
                name: "apple-mobile-web-app-status-bar-style",
                content: "default",
            },
        ],
        links: [
            { rel: "stylesheet", href: appCss },
            { rel: "manifest", href: "/app/manifest.webmanifest" },
            { rel: "icon", type: "image/png", href: "/app/images/sapo.png" },
            { rel: "apple-touch-icon", href: "/app/icons/app-192.png" },
        ],
    }),
    component: () => (
        <AppProvider>
            <Outlet />
        </AppProvider>
    ),
    shellComponent: RootDocument,
    notFoundComponent: () => (
        <main class="message-screen">
            <h1>Page not found.</h1>
            <Link to="/">Back to SAPO</Link>
        </main>
    ),
    errorComponent: () => (
        <main class="message-screen">
            <h1>Something went wrong.</h1>
            <p>Please refresh and try again.</p>
            <a href="/app/">Back to SAPO</a>
        </main>
    ),
});

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
