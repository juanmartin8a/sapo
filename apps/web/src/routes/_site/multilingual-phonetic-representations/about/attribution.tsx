import { Link, createFileRoute } from "@tanstack/solid-router";
import MarkdownDocument from "@/components/site/MarkdownDocument";
import markdown from "@/lib/content/database-attribution.md?raw";
export const Route = createFileRoute(
    "/_site/multilingual-phonetic-representations/about/attribution",
)({
    head: () => ({
        meta: [
            { title: "Data sources & attribution | S A P O" },
            {
                name: "description",
                content:
                    "Data sources, wordfreq and SUBTLEX credits, licensing, and provenance for the Multilingual Phonetic Representations database.",
            },
        ],
    }),
    component: () => (
        <MarkdownDocument markdown={markdown} linksInNewTab>
            <nav class="resource-section" aria-label="Database resources">
                <Link
                    class="resource-link"
                    to="/multilingual-phonetic-representations/about/"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <span class="link-label">{"About the database "}</span>
                    <span aria-hidden="true">{"→"}</span>
                </Link>
            </nav>
        </MarkdownDocument>
    ),
});
