import { describe, expect, it } from "@jest/globals";

import {
    resolveRevenueCatWebhookTargetUserIds,
    shouldSkipRevenueCatWebhookIngestion,
} from "../model/subscriptions/revenueCatWebhookIngestion";

describe("RevenueCat webhook ingestion guards", () => {
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
});
