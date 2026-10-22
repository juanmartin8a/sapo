import { createFileRoute } from "@tanstack/solid-router";
import DatabasePage from "@/components/site/DatabasePage";
export const Route = createFileRoute("/_site/multilingual-phonetic-representations/")({
    head: () => ({
        meta: [
            { title: "Pronunciations | S A P O" },
            {
                name: "description",
                content:
                    "Browse SAPO pronunciations by source and target language, with IPA and easy-to-read respellings.",
            },
        ],
    }),
    validateSearch: (search: Record<string, unknown>): { source?: string; target?: string } => ({
        source: typeof search.source === "string" ? search.source : undefined,
        target: typeof search.target === "string" ? search.target : undefined,
    }),
    component: DatabasePage,
});
