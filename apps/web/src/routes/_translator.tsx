import { createFileRoute } from "@tanstack/solid-router";
import TranslatorLayout from "@/components/TranslatorLayout";
import translatorCss from "@/styles/translator.css?url";

export const Route = createFileRoute("/_translator")({
    head: () => ({
        meta: [
            { title: "S A P O — Translate & Respell" },
            { name: "description", content: "Translate and respell text with SAPO." },
        ],
        links: [{ rel: "stylesheet", href: translatorCss }],
    }),
    component: TranslatorLayout,
});
