import { createFileRoute } from "@tanstack/solid-router";
import SiteLayout from "@/components/site/SiteLayout";
export const Route = createFileRoute("/_site")({
    component: SiteLayout,
    head: () => ({
        links: [
            "/app/images/sapo-frog.svg",
            "/app/images/sapo-frog-open.svg",
            "/app/images/sapo-dark.png",
            "/app/images/sapo-mouth-open-dark.png",
        ].map((href) => ({
            rel: "preload",
            as: "image",
            href,
            type: href.endsWith(".png") ? "image/png" : "image/svg+xml",
            fetchPriority: "high",
        })),
    }),
});
