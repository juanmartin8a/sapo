import assert from "node:assert/strict";
import { test } from "node:test";
import Stripe from "stripe";
import {
    BILLING_ENABLED,
    handleStripeWebhook,
    verifyStripeWebhook,
} from "../src/lib/stripe.server.ts";

test("the Stripe foundation verifies signatures without enabling purchases", () => {
    const previousKey = process.env.STRIPE_SECRET_KEY;
    const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
    try {
        process.env.STRIPE_SECRET_KEY = "sk_test_fixture_only";
        process.env.STRIPE_WEBHOOK_SECRET = "whsec_fixture_only";
        const payload = JSON.stringify({
            id: "evt_fixture",
            type: "checkout.session.completed",
            data: { object: {} },
        });
        const signature = Stripe.webhooks.generateTestHeaderString({
            payload,
            secret: process.env.STRIPE_WEBHOOK_SECRET,
        });
        assert.equal(verifyStripeWebhook(payload, signature).id, "evt_fixture");
        assert.throws(() => verifyStripeWebhook(`${payload} `, signature));
        assert.equal(BILLING_ENABLED, false);
        assert.equal(handleStripeWebhook().status, 503);
    } finally {
        if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY;
        else process.env.STRIPE_SECRET_KEY = previousKey;
        if (previousSecret === undefined)
            delete process.env.STRIPE_WEBHOOK_SECRET;
        else process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
    }
});
