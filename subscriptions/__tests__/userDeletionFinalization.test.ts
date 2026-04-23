import { describe, expect, it } from "@jest/globals";

import {
    isUserDeletionCleanupComplete,
    resolveUserDeletionFinalizationDecision,
} from "../userDeletionFinalization";

describe("user deletion finalization decision", () => {
    it("uses the saved deletion preparation when it exists", () => {
        expect(
            resolveUserDeletionFinalizationDecision({
                preparedDeletionContext: {
                    has_active_subscription: true,
                    revenuecat_app_user_id: "rc_user_123",
                    preserved_quota_period_id: "quota_123",
                },
                cleanupStatus: {
                    has_subscription_states: true,
                    has_quota_periods: true,
                    has_usage_events: false,
                    has_revenue_cat_events: false,
                },
            })
        ).toEqual({
            status: "use_prepared_context",
            context: {
                has_active_subscription: true,
                revenuecat_app_user_id: "rc_user_123",
                preserved_quota_period_id: "quota_123",
            },
        });
    });

    it("treats empty cleanup status as already finalized", () => {
        const cleanupStatus = {
            has_subscription_states: false,
            has_quota_periods: false,
            has_usage_events: false,
            has_revenue_cat_events: false,
        };

        expect(isUserDeletionCleanupComplete(cleanupStatus)).toBe(true);
        expect(
            resolveUserDeletionFinalizationDecision({
                preparedDeletionContext: null,
                cleanupStatus,
            })
        ).toEqual({
            status: "already_finalized",
        });
    });

    it("fails closed when preparation is missing and cleanup is incomplete", () => {
        expect(
            resolveUserDeletionFinalizationDecision({
                preparedDeletionContext: null,
                cleanupStatus: {
                    has_subscription_states: true,
                    has_quota_periods: false,
                    has_usage_events: false,
                    has_revenue_cat_events: false,
                },
            })
        ).toEqual({
            status: "missing_preparation",
        });
    });
});
