import { createFileRoute } from "@tanstack/solid-router";
import SupportPage from "@/components/site/SupportPage";
export const Route = createFileRoute("/_site/contact-us")({
    head: () => ({
        meta: [
            { title: "Support | S A P O" },
            { name: "description", content: "Contact S A P O support." },
        ],
    }),
    component: SupportPage,
});
