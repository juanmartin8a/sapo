import { createFileRoute } from "@tanstack/solid-router";
import { handleStripeWebhook } from "@/lib/stripe.server";

export const Route = createFileRoute("/app/api/stripe/webhook")({
    server: { handlers: { POST: () => handleStripeWebhook() } },
});
