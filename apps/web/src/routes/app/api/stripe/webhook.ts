import { createFileRoute } from "@tanstack/solid-router";

export const Route = createFileRoute("/app/api/stripe/webhook")({
    server: {
        handlers: {
            // Reject events until durable billing and shared entitlements are implemented.
            POST: () =>
                Response.json(
                    { error: "Billing is not enabled." },
                    { status: 503, headers: { "Cache-Control": "no-store" } },
                ),
        },
    },
});
