import { createFileRoute } from "@tanstack/solid-router";
import SiteLayout from "@/components/site/SiteLayout";
export const Route = createFileRoute("/_site")({
    component: SiteLayout,
});
