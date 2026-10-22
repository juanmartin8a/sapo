import { createFileRoute } from "@tanstack/solid-router";
import TranslatorLayout from "@/components/TranslatorLayout";
import translatorCss from "@/styles/translator.css?url";

export const Route = createFileRoute("/app")({
    head: () => ({
        meta: [
            { title: "S A P O — Translate & Respell" },
            { name: "description", content: "Translate and respell text with SAPO." },
        ],
        links: [
            { rel: "stylesheet", href: translatorCss },
            { rel: "icon", type: "image/png", href: "/app/images/sapo.png" },
        ],
    }),
    component: TranslatorLayout,
});
