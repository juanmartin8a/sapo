import { createFileRoute } from "@tanstack/solid-router";
import MarkdownDocument from "@/components/site/MarkdownDocument";
import markdown from "@/lib/content/terms-of-use.md?raw";
export const Route = createFileRoute("/_site/terms-of-use")({
    head: () => ({ meta: [{ title: "Terms of Use | S A P O" }] }),
    component: () => <MarkdownDocument markdown={markdown}></MarkdownDocument>,
});
