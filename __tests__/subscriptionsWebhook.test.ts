import { afterEach, describe, expect, it, jest } from "@jest/globals";

import {
    buildRevenueCatWebhookEventForIngestion,
    resolveRevenueCatWebhookTargetUserIds,
    shouldSkipRevenueCatWebhookIngestion,
} from "../model/subscriptions/revenueCatWebhookIngestion";
import {
    getRevenueCatWebhookEnvironmentDisposition,
} from "../model/subscriptions/revenueCatWebhookHttp";
import { handleRevenueCatWebhookRequest } from "../model/subscriptions/revenueCatWebhook";
import {
    getRevenueCatWebhookCancelReasonFromRawPayload,
    normalizeRevenueCatWebhookEvent,
} from "../model/subscriptions/revenueCatWebhookPayload";

const originalEnv = process.env;

afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
});

function revenueCatWebhookRequest(environment: string) {
    return new Request("https://example.com/webhooks/revenuecat", {
        method: "POST",
        headers: {
            Authorization: "Bearer webhook-secret",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            event: {
                id: "event_1",
                type: "RENEWAL",
                event_timestamp_ms: 1_000,
                app_user_id: "user_1",
                environment,
            },
        }),
    });
}

describe("RevenueCat webhook ingestion guards", () => {
    it("requires a valid RevenueCat event timestamp", () => {
        const baseEvent = {
            id: "event_1",
            type: "RENEWAL",
        };

        expect(normalizeRevenueCatWebhookEvent({ event: baseEvent }, 1_000)).toBeNull();
        expect(normalizeRevenueCatWebhookEvent({
            event: { ...baseEvent, event_timestamp_ms: "1000" },
        }, 1_000)).toBeNull();
        expect(normalizeRevenueCatWebhookEvent({
            event: { ...baseEvent, event_timestamp_ms: 301_001 },
        }, 1_000)).toBeNull();
        expect(normalizeRevenueCatWebhookEvent({
            event: { ...baseEvent, event_timestamp_ms: 1_000 },
        }, 1_000)).toMatchObject({ event_id: "event_1", event_at_ms: 1_000 });
    });

    it("accepts a matching webhook environment", () => {
        expect(
            getRevenueCatWebhookEnvironmentDisposition("PRODUCTION", "PRODUCTION")
        ).toBe("match");
    });

    it("skips a valid mismatched webhook environment", () => {
        expect(
            getRevenueCatWebhookEnvironmentDisposition("SANDBOX", "PRODUCTION")
        ).toBe("mismatch");
    });

    it("returns HTTP 200 without user lookup or ingestion for a mismatch", async () => {
        process.env = {
            ...originalEnv,
            REVENUECAT_WEBHOOK_AUTH_SECRET: "webhook-secret",
            REVENUECAT_WEBHOOK_ENVIRONMENT: "PRODUCTION",
        };
        jest.spyOn(console, "info").mockImplementation(() => undefined);
        const ctx = {
            runQuery: jest.fn(),
            runMutation: jest.fn(),
            scheduler: { runAfter: jest.fn() },
        };

        const response = await handleRevenueCatWebhookRequest(
            ctx as never,
            revenueCatWebhookRequest("SANDBOX")
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ ok: true, skipped: true });
        expect(ctx.runQuery).not.toHaveBeenCalled();
        expect(ctx.runMutation).not.toHaveBeenCalled();
        expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
    });

    it.each([
        ["SANDBOX", "PRODUCTION", "reviewer", " reviewer, tester\nthird ", "match"],
        ["SANDBOX", "PRODUCTION", "review", "reviewer", "mismatch"],
        ["SANDBOX", "PRODUCTION", "reviewer", "", "mismatch"],
        ["PRODUCTION", "PRODUCTION", "customer", "", "match"],
        ["PRODUCTION", "SANDBOX", "reviewer", "reviewer", "mismatch"],
        ["SANDBOX", "SANDBOX", "tester", "", "match"],
        ["STAGING", "PRODUCTION", "reviewer", "reviewer", "invalid_event_environment"],
    ])("checks %s in %s for %s", (event, deployment, user, allowed, expected) => {
        expect(getRevenueCatWebhookEnvironmentDisposition(event, deployment, user, allowed))
            .toBe(expected);
    });

    it("ingests only allowlisted participants of a sandbox transfer in production", async () => {
        process.env = {
            ...originalEnv,
            REVENUECAT_WEBHOOK_AUTH_SECRET: "webhook-secret",
            REVENUECAT_WEBHOOK_ENVIRONMENT: "PRODUCTION",
            REVENUECAT_SANDBOX_ALLOWED_APP_USER_IDS: "reviewer",
        };
        const ctx = {
            runQuery: jest.fn(async (_ref: unknown, args: Record<string, unknown>) =>
                args.model === "user" ? { _id: "reviewer" } : {}
            ),
            runMutation: jest.fn(async () => ({ event_doc_id: "event_doc" })),
            scheduler: { runAfter: jest.fn(async () => null) },
        };
        const response = await handleRevenueCatWebhookRequest(ctx as never, new Request(
            "https://example.com/webhooks/revenuecat", {
                method: "POST",
                headers: { Authorization: "Bearer webhook-secret", "Content-Type": "application/json" },
                body: JSON.stringify({ event: {
                    id: "transfer_1", type: "TRANSFER", event_timestamp_ms: 1_000,
                    environment: "SANDBOX", app_user_id: "reviewer",
                    aliases: ["unapproved_alias"],
                    transferred_from: ["reviewer"], transferred_to: ["unapproved_destination"],
                } }),
            }
        ));
        expect(response.status).toBe(200);
        expect(ctx.runQuery).toHaveBeenCalledTimes(2);
        expect(ctx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            normalized_event: expect.objectContaining({
                app_user_id: "reviewer", aliases: [],
                transferred_from: ["reviewer"], transferred_to: [],
            }),
        }));
        expect(JSON.stringify(ctx.runMutation.mock.calls)).not.toContain("unapproved");
        expect(ctx.scheduler.runAfter).toHaveBeenCalledTimes(1);
    });

    it("compares lowercase event environments case-insensitively", () => {
        expect(
            getRevenueCatWebhookEnvironmentDisposition("sandbox", "SANDBOX")
        ).toBe("match");
    });

    it("fails closed when the event environment is missing", () => {
        expect(
            getRevenueCatWebhookEnvironmentDisposition(undefined, "PRODUCTION")
        ).toBe("invalid_event_environment");
    });

    it("fails closed when the event environment is invalid", () => {
        expect(
            getRevenueCatWebhookEnvironmentDisposition("STAGING", "PRODUCTION")
        ).toBe("invalid_event_environment");
    });

    it("fails closed when the configured environment is missing or invalid", () => {
        expect(
            getRevenueCatWebhookEnvironmentDisposition("PRODUCTION", undefined)
        ).toBe("invalid_configuration");
        expect(
            getRevenueCatWebhookEnvironmentDisposition("PRODUCTION", "production")
        ).toBe("invalid_configuration");
        expect(
            getRevenueCatWebhookEnvironmentDisposition("PRODUCTION", "STAGING")
        ).toBe("invalid_configuration");
    });

    it("prefers transferred users and ignores RevenueCat-generated ids", () => {
        expect(
            resolveRevenueCatWebhookTargetUserIds({
                app_user_id: "$RCAnonymousID:generated",
                original_app_user_id: "user_original",
                aliases: ["user_alias", "user_original"],
                transferred_from: ["$RCAnonymousID:source_generated", "user_from"],
                transferred_to: ["user_to", "$RCAnonymousID:target_generated"],
            })
        ).toEqual(["user_to", "user_from", "user_original", "user_alias"]);
    });

    it("skips ingestion only when every resolved user is deleted or deleting", () => {
        expect(
            shouldSkipRevenueCatWebhookIngestion({
                candidate_user_ids: ["user_1"],
                eligible_user_ids: [],
            })
        ).toBe(true);

        expect(
            shouldSkipRevenueCatWebhookIngestion({
                candidate_user_ids: ["user_1", "user_2"],
                eligible_user_ids: ["user_2"],
            })
        ).toBe(false);

        expect(
            shouldSkipRevenueCatWebhookIngestion({
                candidate_user_ids: [],
                eligible_user_ids: [],
            })
        ).toBe(false);
    });

    it("builds a valid fallback user reference for partially eligible transfers", () => {
        expect(
            buildRevenueCatWebhookEventForIngestion(
                {
                    event_id: "transfer_1",
                    event_type: "TRANSFER",
                    event_at_ms: 1_000,
                    aliases: [],
                    transferred_from: ["user_from"],
                    transferred_to: ["user_to"],
                    entitlement_ids: [],
                },
                ["user_to"]
            )
        ).toEqual({
            event_id: "transfer_1",
            event_type: "TRANSFER",
            event_at_ms: 1_000,
            app_user_id: undefined,
            original_app_user_id: undefined,
            aliases: [],
            transferred_from: [],
            transferred_to: ["user_to"],
            user_id: "user_to",
            entitlement_ids: [],
        });
    });

    it("preserves cancellation reasons needed to distinguish refunds", () => {
        expect(getRevenueCatWebhookCancelReasonFromRawPayload(JSON.stringify({
            event: {
                id: "event_1",
                type: "CANCELLATION",
                event_timestamp_ms: 1_000,
                cancel_reason: "CUSTOMER_SUPPORT",
            },
        }))).toBe("CUSTOMER_SUPPORT");
        expect(getRevenueCatWebhookCancelReasonFromRawPayload("invalid")).toBeUndefined();
    });
});
