import { createFileRoute } from "@tanstack/solid-router";
import SiteLayout from "@/components/site/SiteLayout";
export const Route = createFileRoute("/_site")({
    component: SiteLayout,
    head: () => ({
        links: [
            "/app/images/sapo-frog.svg",
            "/app/images/sapo-frog-open.svg",
            "/app/images/sapo-frog-dark.svg",
            "/app/images/sapo-frog-open-dark.svg",
        ].map((href) => ({
            rel: "preload",
            as: "image",
            href,
            type: "image/svg+xml",
            fetchPriority: "high",
        })),
    }),
});
