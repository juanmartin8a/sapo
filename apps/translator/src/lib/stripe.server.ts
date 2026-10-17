import "@tanstack/solid-start/server-only";
import Stripe from "stripe";

// Keep billing off until Checkout, durable event processing, and shared
// RevenueCat/Stripe entitlement reconciliation are implemented together.
export const BILLING_ENABLED = false;

export function getStripeClient() {
    const key = process.env.STRIPE_SECRET_KEY;
    return key ? new Stripe(key, { maxNetworkRetries: 2 }) : null;
}

export function verifyStripeWebhook(payload: string, signature: string) {
    const client = getStripeClient();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!client || !secret)
        throw new Error("Stripe webhook is not configured.");
    return client.webhooks.constructEvent(payload, signature, secret);
}

export function handleStripeWebhook() {
    // Fail explicitly rather than acknowledge and discard unprocessed events.
    return Response.json(
        { error: "Billing is not enabled." },
        {
            status: 503,
            headers: { "Cache-Control": "no-store" },
        },
    );
}
