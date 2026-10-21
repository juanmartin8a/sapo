import { createFileRoute } from "@tanstack/solid-router";
import TranslatorLayout from "@/components/TranslatorLayout";

export const Route = createFileRoute("/pwa")({
    head: () => ({
        meta: [
            { title: "S A P O — Translate & Respell" },
            { name: "description", content: "Translate and respell text with SAPO." },
            { name: "theme-color", content: "#ffffff" },
            { name: "apple-mobile-web-app-capable", content: "yes" },
            { name: "apple-mobile-web-app-status-bar-style", content: "default" },
        ],
        links: [
            { rel: "manifest", href: "/pwa/manifest.webmanifest" },
            { rel: "icon", type: "image/png", href: "/app/images/sapo.png" },
            { rel: "apple-touch-icon", href: "/pwa/icons/app-192.png" },
        ],
    }),
    component: () => <TranslatorLayout pwa />,
});
