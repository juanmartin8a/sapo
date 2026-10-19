import { createFileRoute, Outlet } from "@tanstack/solid-router";
import AppProvider from "@/providers/AppProvider";
import SiteFooter from "@/components/site/SiteFooter";
export const Route = createFileRoute("/app")({
    head: () => ({
        meta: [
            { title: "S A P O — Translate & Respell" },
            { name: "description", content: "Translate and respell text with SAPO." },
            { name: "theme-color", content: "#ffffff" },
            { name: "apple-mobile-web-app-capable", content: "yes" },
            { name: "apple-mobile-web-app-status-bar-style", content: "default" },
        ],
        links: [
            { rel: "manifest", href: "/app/manifest.webmanifest" },
            { rel: "icon", type: "image/png", href: "/app/images/sapo.png" },
            { rel: "apple-touch-icon", href: "/app/icons/app-192.png" },
        ],
    }),
    component: () => (
        <div class="translator">
            <AppProvider>
                <Outlet />
            </AppProvider>
            <SiteFooter />
        </div>
    ),
});
