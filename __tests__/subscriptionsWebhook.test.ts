import { describe, expect, it } from "@jest/globals";

import {
    buildRevenueCatWebhookEventForIngestion,
    resolveRevenueCatWebhookTargetUserIds,
    shouldSkipRevenueCatWebhookIngestion,
} from "../model/subscriptions/revenueCatWebhookIngestion";
import {
    getRevenueCatWebhookCancelReasonFromRawPayload,
    normalizeRevenueCatWebhookEvent,
} from "../model/subscriptions/revenueCatWebhookPayload";

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
