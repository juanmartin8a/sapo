import { describe, expect, it } from "@jest/globals";

import {
    filterRevenueCatEventUserReferences,
    pruneRevenueCatEventUserReferences,
    summarizeRevenueCatEventUsers,
} from "../model/subscriptions/revenueCatEventUsers";

describe("RevenueCat event user helpers", () => {
    it("does not infer per-user status from target references alone", () => {
        expect(
            summarizeRevenueCatEventUsers({
                resolved_target_user_ids: ["user_to", "user_from", "user_alias"],
                links: [
                    {
                        user_id: "user_to",
                        status: "processed",
                    },
                ],
            })
        ).toEqual({
            target_user_ids: ["user_to", "user_from", "user_alias"],
            pending_user_ids: [],
            processed_user_ids: ["user_to"],
            ignored_user_ids: [],
        });
    });

    it("keeps ignored users terminal while preserving target order", () => {
        expect(
            summarizeRevenueCatEventUsers({
                resolved_target_user_ids: ["user_to", "user_from"],
                links: [
                    {
                        user_id: "user_from",
                        status: "ignored",
                    },
                    {
                        user_id: "user_to",
                        status: "processed",
                    },
                ],
            })
        ).toEqual({
            target_user_ids: ["user_to", "user_from"],
            pending_user_ids: [],
            processed_user_ids: ["user_to"],
            ignored_user_ids: ["user_from"],
        });
    });

    it("prunes deleted users from shared event references", () => {
        expect(
            pruneRevenueCatEventUserReferences({
                removed_user_id: "user_from",
                remaining_user_ids: ["user_to"],
                app_user_id: "user_to",
                original_app_user_id: "user_from",
                aliases: ["user_from", "user_to"],
                transferred_from: ["user_from"],
                transferred_to: ["user_to"],
                user_id: "user_from",
            })
        ).toEqual({
            app_user_id: "user_to",
            original_app_user_id: undefined,
            aliases: ["user_to"],
            transferred_from: [],
            transferred_to: ["user_to"],
            user_id: "user_to",
        });
    });

    it("filters mixed-user event references down to eligible users", () => {
        expect(
            filterRevenueCatEventUserReferences({
                allowed_user_ids: ["user_to"],
                app_user_id: "user_from",
                original_app_user_id: "user_to",
                aliases: ["user_from", "user_to"],
                transferred_from: ["user_from"],
                transferred_to: ["user_to", "user_from"],
                user_id: "user_from",
            })
        ).toEqual({
            app_user_id: undefined,
            original_app_user_id: "user_to",
            aliases: ["user_to"],
            transferred_from: [],
            transferred_to: ["user_to"],
            user_id: "user_to",
        });
    });
});
