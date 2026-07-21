import { describe, expect, it } from "@jest/globals";

import {
    assertRequiredPreservedQuotaPeriod,
    canAcquireUserDeletionOperation,
    doesUserDeletionCleanupAttemptOwnOperation,
    doesUserDeletionSubscriptionCleanupHaveRemaining,
    doesUserDeletionStatusAllowAutomaticRetry,
    doesUserDeletionStatusBlockProcessing,
    doesUserDeletionStatusBlockRevenueCatReconciliation,
    hasRequiredPreservedQuotaPeriod,
    resolveAuthDeletedUserDeletionContext,
    resolvePreparedUserDeletionContext,
    resolveUserDeletionAuthDeleteWaitStatus,
    resolveUserDeletionQuiescenceStatus,
    shouldDeleteOverdueActiveUsageEvents,
    USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS,
    USER_DELETION_CLEANUP_DEAD_LETTER_STATUS,
    USER_DELETION_LATE_AUTH_WAIT_STATUS,
} from "../model/subscriptions/userDeletionQueue";

describe("user deletion queue helpers", () => {
    it("blocks user processing for every queued deletion status", () => {
        expect(doesUserDeletionStatusBlockProcessing(undefined)).toBe(false);
        expect(doesUserDeletionStatusBlockProcessing(null)).toBe(false);
        expect(doesUserDeletionStatusBlockProcessing(USER_DELETION_LATE_AUTH_WAIT_STATUS)).toBe(
            true
        );
        expect(
            doesUserDeletionStatusBlockProcessing(USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS)
        ).toBe(true);
        expect(
            doesUserDeletionStatusBlockProcessing(USER_DELETION_CLEANUP_DEAD_LETTER_STATUS)
        ).toBe(true);

        expect(doesUserDeletionStatusBlockProcessing("preparing")).toBe(true);
        expect(doesUserDeletionStatusBlockProcessing("awaiting_auth_delete")).toBe(true);
        expect(doesUserDeletionStatusBlockProcessing("ready_for_cleanup")).toBe(true);
        expect(doesUserDeletionStatusBlockProcessing("waiting_for_quiescence")).toBe(true);
        expect(doesUserDeletionStatusBlockProcessing("retryable_error")).toBe(true);
        expect(doesUserDeletionStatusBlockProcessing("cleanup_in_progress")).toBe(true);
    });

    it("blocks RevenueCat reconciliation for every queued deletion status", () => {
        expect(doesUserDeletionStatusBlockRevenueCatReconciliation(undefined)).toBe(false);
        expect(doesUserDeletionStatusBlockRevenueCatReconciliation(null)).toBe(false);
        expect(
            doesUserDeletionStatusBlockRevenueCatReconciliation(USER_DELETION_LATE_AUTH_WAIT_STATUS)
        ).toBe(true);
        expect(
            doesUserDeletionStatusBlockRevenueCatReconciliation(
                USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS
            )
        ).toBe(true);
        expect(
            doesUserDeletionStatusBlockRevenueCatReconciliation(
                USER_DELETION_CLEANUP_DEAD_LETTER_STATUS
            )
        ).toBe(true);

        expect(doesUserDeletionStatusBlockRevenueCatReconciliation("preparing")).toBe(true);
        expect(doesUserDeletionStatusBlockRevenueCatReconciliation("awaiting_auth_delete")).toBe(
            true
        );
        expect(doesUserDeletionStatusBlockRevenueCatReconciliation("ready_for_cleanup")).toBe(true);
        expect(doesUserDeletionStatusBlockRevenueCatReconciliation("waiting_for_quiescence")).toBe(
            true
        );
        expect(doesUserDeletionStatusBlockRevenueCatReconciliation("retryable_error")).toBe(true);
        expect(doesUserDeletionStatusBlockRevenueCatReconciliation("cleanup_in_progress")).toBe(
            true
        );
    });

    it("stops automatic retry for terminal dead-letter states", () => {
        expect(doesUserDeletionStatusAllowAutomaticRetry(undefined)).toBe(true);
        expect(doesUserDeletionStatusAllowAutomaticRetry("awaiting_auth_delete")).toBe(true);
        expect(doesUserDeletionStatusAllowAutomaticRetry(USER_DELETION_LATE_AUTH_WAIT_STATUS)).toBe(
            true
        );
        expect(
            doesUserDeletionStatusAllowAutomaticRetry(USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS)
        ).toBe(false);
        expect(
            doesUserDeletionStatusAllowAutomaticRetry(USER_DELETION_CLEANUP_DEAD_LETTER_STATUS)
        ).toBe(false);
    });

    it("allows explicit terminal recovery to reacquire dead-lettered deletions", () => {
        expect(
            canAcquireUserDeletionOperation({
                status: USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS,
                now_ms: 1_000,
                next_retry_at_ms: 253402300799999,
            })
        ).toBe(false);

        expect(
            canAcquireUserDeletionOperation({
                status: USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS,
                now_ms: 1_000,
                next_retry_at_ms: 253402300799999,
                allow_terminal_recovery: true,
            })
        ).toBe(true);

        expect(
            canAcquireUserDeletionOperation({
                status: USER_DELETION_CLEANUP_DEAD_LETTER_STATUS,
                now_ms: 1_000,
                next_retry_at_ms: 253402300799999,
                allow_terminal_recovery: true,
            })
        ).toBe(true);

        expect(
            canAcquireUserDeletionOperation({
                status: "awaiting_auth_delete",
                now_ms: 1_000,
                next_retry_at_ms: 2_000,
                allow_terminal_recovery: true,
            })
        ).toBe(false);
    });

    it("uses cleanup lease expiry when acquiring in-progress cleanup", () => {
        expect(
            canAcquireUserDeletionOperation({
                status: "cleanup_in_progress",
                now_ms: 1_000,
                next_retry_at_ms: 500,
                cleanup_lease_expires_at_ms: 2_000,
            })
        ).toBe(false);

        expect(
            canAcquireUserDeletionOperation({
                status: "cleanup_in_progress",
                now_ms: 2_000,
                next_retry_at_ms: 500,
                cleanup_lease_expires_at_ms: 2_000,
            })
        ).toBe(true);
    });

    it("requires exact cleanup attempt ownership after acquisition", () => {
        expect(
            doesUserDeletionCleanupAttemptOwnOperation({
                current_cleanup_attempt_id: "attempt_a",
                cleanup_attempt_id: "attempt_a",
            })
        ).toBe(true);

        expect(
            doesUserDeletionCleanupAttemptOwnOperation({
                current_cleanup_attempt_id: "attempt_a",
                cleanup_attempt_id: "attempt_b",
            })
        ).toBe(false);

        expect(
            doesUserDeletionCleanupAttemptOwnOperation({
                current_cleanup_attempt_id: undefined,
                cleanup_attempt_id: "attempt_a",
            })
        ).toBe(false);
    });

    it("escalates auth-delete waiting from fast poll to late poll to dead-letter", () => {
        expect(
            resolveUserDeletionAuthDeleteWaitStatus({
                elapsed_ms: 30_000,
                confirm_timeout_ms: 60_000,
                dead_letter_timeout_ms: 86_400_000,
            })
        ).toBe("awaiting_auth_delete");

        expect(
            resolveUserDeletionAuthDeleteWaitStatus({
                elapsed_ms: 60_000,
                confirm_timeout_ms: 60_000,
                dead_letter_timeout_ms: 86_400_000,
            })
        ).toBe(USER_DELETION_LATE_AUTH_WAIT_STATUS);

        expect(
            resolveUserDeletionAuthDeleteWaitStatus({
                elapsed_ms: 86_400_000,
                confirm_timeout_ms: 60_000,
                dead_letter_timeout_ms: 86_400_000,
            })
        ).toBe(USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS);
    });

    it("waits for active usage naturally and escalates only after the grace period", () => {
        expect(
            resolveUserDeletionQuiescenceStatus({
                active_usage_event_count: 1,
                active_revenuecat_event_processing_count: 0,
                now_ms: 1_000,
                grace_ends_at_ms: 2_000,
            })
        ).toBe("waiting_for_quiescence");

        expect(
            resolveUserDeletionQuiescenceStatus({
                active_usage_event_count: 0,
                active_revenuecat_event_processing_count: 0,
                now_ms: 1_000,
                grace_ends_at_ms: 2_000,
            })
        ).toBe("ready");

        expect(
            resolveUserDeletionQuiescenceStatus({
                active_usage_event_count: 1,
                active_revenuecat_event_processing_count: 0,
                now_ms: 2_000,
                grace_ends_at_ms: 2_000,
            })
        ).toBe("overdue");
    });

    it("authoritatively deletes overdue usage only after RevenueCat processing is quiet", () => {
        expect(
            shouldDeleteOverdueActiveUsageEvents({
                quiescence_status: "overdue",
                active_usage_event_count: 1,
                active_revenuecat_event_processing_count: 0,
            })
        ).toBe(true);

        expect(
            shouldDeleteOverdueActiveUsageEvents({
                quiescence_status: "waiting_for_quiescence",
                active_usage_event_count: 1,
                active_revenuecat_event_processing_count: 0,
            })
        ).toBe(false);

        expect(
            shouldDeleteOverdueActiveUsageEvents({
                quiescence_status: "overdue",
                active_usage_event_count: 1,
                active_revenuecat_event_processing_count: 1,
            })
        ).toBe(false);
    });

    it("continues subscription cleanup when an earlier table exhausts the delete budget", () => {
        expect(
            doesUserDeletionSubscriptionCleanupHaveRemaining({
                remaining_delete_budget: 0,
                usage_event_has_more: false,
                revenuecat_event_has_more: false,
                quota_period_has_more: false,
            })
        ).toBe(true);

        expect(
            doesUserDeletionSubscriptionCleanupHaveRemaining({
                remaining_delete_budget: 1,
                usage_event_has_more: false,
                revenuecat_event_has_more: false,
                quota_period_has_more: false,
            })
        ).toBe(false);
    });

    it("prefers the latest snapshot when transitioning to auth-deleted cleanup", () => {
        expect(
            resolveAuthDeletedUserDeletionContext({
                snapshot: {
                    has_active_subscription: true,
                    revenuecat_app_user_id: "rc_current",
                    current_quota_period_id: "quota_current",
                    store_subscription_id: "store_current",
                    store_subscription_period_id: "period_current",
                },
                existing_context: {
                    has_active_subscription: false,
                    revenuecat_app_user_id: "rc_stale",
                    preserved_quota_period_id: "quota_stale",
                    store_subscription_id: "store_stale",
                    store_subscription_period_id: "period_stale",
                },
            })
        ).toEqual({
            has_active_subscription: true,
            revenuecat_app_user_id: "rc_current",
            preserved_quota_period_id: "quota_current",
            store_subscription_id: "store_current",
            store_subscription_period_id: "period_current",
        });
    });

    it("falls back to the existing preserved quota period when the fresh snapshot is incomplete", () => {
        expect(
            resolveAuthDeletedUserDeletionContext({
                snapshot: {
                    has_active_subscription: true,
                    revenuecat_app_user_id: "rc_current",
                    current_quota_period_id: undefined,
                    store_subscription_id: "store_current",
                    store_subscription_period_id: undefined,
                },
                existing_context: {
                    has_active_subscription: true,
                    revenuecat_app_user_id: "rc_stale",
                    preserved_quota_period_id: "quota_stale",
                    store_subscription_id: "store_stale",
                    store_subscription_period_id: "period_stale",
                },
            })
        ).toEqual({
            has_active_subscription: true,
            revenuecat_app_user_id: "rc_current",
            preserved_quota_period_id: "quota_stale",
            store_subscription_id: "store_current",
            store_subscription_period_id: "period_stale",
        });
    });

    it("drops preserved paid context when the latest snapshot is no longer active", () => {
        expect(
            resolveAuthDeletedUserDeletionContext({
                snapshot: {
                    has_active_subscription: false,
                    revenuecat_app_user_id: "rc_current",
                },
                existing_context: {
                    has_active_subscription: true,
                    revenuecat_app_user_id: "rc_stale",
                    preserved_quota_period_id: "quota_stale",
                    store_subscription_id: "store_stale",
                    store_subscription_period_id: "period_stale",
                },
            })
        ).toEqual({
            has_active_subscription: false,
            revenuecat_app_user_id: "rc_current",
            preserved_quota_period_id: undefined,
            store_subscription_id: "store_stale",
            store_subscription_period_id: "period_stale",
        });
    });

    it("uses the refresh app user id when the deletion snapshot omits it", () => {
        expect(
            resolvePreparedUserDeletionContext({
                snapshot: {
                    has_active_subscription: true,
                    revenuecat_app_user_id: undefined,
                    current_quota_period_id: "quota_current",
                    store_subscription_id: "store_current",
                    store_subscription_period_id: "period_current",
                },
                fallback_revenuecat_app_user_id: "user_from_refresh_attempt",
            })
        ).toEqual({
            has_active_subscription: true,
            revenuecat_app_user_id: "user_from_refresh_attempt",
            preserved_quota_period_id: "quota_current",
            store_subscription_id: "store_current",
            store_subscription_period_id: "period_current",
        });
    });

    it("drops preserved quota context for free prepared deletion snapshots", () => {
        expect(
            resolvePreparedUserDeletionContext({
                snapshot: {
                    has_active_subscription: false,
                    revenuecat_app_user_id: "rc_current",
                    current_quota_period_id: "quota_current",
                    store_subscription_id: "store_current",
                    store_subscription_period_id: "period_current",
                },
            })
        ).toEqual({
            has_active_subscription: false,
            revenuecat_app_user_id: "rc_current",
            preserved_quota_period_id: undefined,
            store_subscription_id: "store_current",
            store_subscription_period_id: "period_current",
        });
    });

    it("requires a preserved quota period only for active subscription cleanup", () => {
        expect(
            hasRequiredPreservedQuotaPeriod({
                has_active_subscription: true,
                preserved_quota_period_id: undefined,
            })
        ).toBe(false);

        expect(
            hasRequiredPreservedQuotaPeriod({
                has_active_subscription: true,
                preserved_quota_period_id: "quota_current",
            })
        ).toBe(true);

        expect(
            hasRequiredPreservedQuotaPeriod({
                has_active_subscription: false,
                preserved_quota_period_id: undefined,
            })
        ).toBe(true);
    });

    it("throws when active subscription cleanup lacks a preserved quota period", () => {
        expect(() =>
            assertRequiredPreservedQuotaPeriod({
                user_id: "user_active",
                has_active_subscription: true,
                preserved_quota_period_id: undefined,
            })
        ).toThrow("Cannot continue paid-user deletion without a preserved quota period for user user_active");

        expect(() =>
            assertRequiredPreservedQuotaPeriod({
                user_id: "user_active",
                has_active_subscription: true,
                preserved_quota_period_id: "quota_current",
            })
        ).not.toThrow();
    });
});
