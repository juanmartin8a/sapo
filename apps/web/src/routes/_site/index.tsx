import { createFileRoute } from "@tanstack/solid-router";
import LandingPage from "@/components/site/LandingPage";
export const Route = createFileRoute("/_site/")({
    head: () => ({
        meta: [
            { title: "SAPO — Phonetic respelling" },
            {
                name: "description",
                content:
                    "SAPO offers a multilingual phonetic representations database and mobile and web apps for translation and cross-lingual pronunciation respelling.",
            },
        ],
    }),
    component: LandingPage,
});
