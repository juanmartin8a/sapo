import { Link } from "@tanstack/solid-router";
import { createFileRoute } from "@tanstack/solid-router";
import MarkdownDocument from "@/components/site/MarkdownDocument";
import markdown from "@/lib/content/database-about.md?raw";
export const Route = createFileRoute("/_site/multilingual-phonetic-representations/about/")({
    head: () => ({
        meta: [
            { title: "About the database | S A P O" },
            {
                name: "description",
                content:
                    "Learn about the Multilingual Phonetic Representations database, its pronunciation guides, data sources, and CC BY-SA 4.0 license.",
            },
        ],
    }),
    component: () => (
        <MarkdownDocument markdown={markdown} linksInNewTab>
            <nav class="resource-section database-resources" aria-label="Database resources">
                <Link
                    class="resource-link"
                    to="/multilingual-phonetic-representations/about/attribution/"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    {"Data sources & attribution "}
                    <span aria-hidden="true">{"→"}</span>
                </Link>
                <Link
                    class="resource-link"
                    to="/multilingual-phonetic-representations/"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    {"Browse the database "}
                    <span aria-hidden="true">{"→"}</span>
                </Link>
            </nav>
        </MarkdownDocument>
    ),
});
