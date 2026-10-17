import { createFileRoute } from "@tanstack/solid-router";
import SiteLayout from "@/components/site/SiteLayout";
export const Route = createFileRoute("/_site")({
    component: SiteLayout,
    head: () => ({
        links: [
            { rel: "icon", href: "/sapo-favicon.svg", type: "image/svg+xml" },
            {
                rel: "preload",
                as: "image",
                href: "/sapo-frog.svg",
                type: "image/svg+xml",
                fetchPriority: "high",
            },
            {
                rel: "preload",
                as: "image",
                href: "/sapo-frog-open.svg",
                type: "image/svg+xml",
                fetchPriority: "high",
            },
        ],
    }),
});
