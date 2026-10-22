import { createFileRoute } from "@tanstack/solid-router";
import MarkdownDocument from "@/components/site/MarkdownDocument";
import markdown from "@/lib/content/privacy-policy.md?raw";
export const Route = createFileRoute("/_site/privacy-policy")({
    head: () => ({ meta: [{ title: "Privacy Policy | S A P O" }] }),
    component: () => <MarkdownDocument markdown={markdown} />,
});
