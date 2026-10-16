export const REVENUECAT_WEBHOOK_EVENT_STATUSES = {
    PENDING: "pending",
    FAILED: "failed",
    PROCESSED: "processed",
    IGNORED: "ignored",
    DEAD_LETTER: "dead_letter",
} as const;

export const REVENUECAT_TERMINAL_WEBHOOK_EVENT_STATUSES = [
    REVENUECAT_WEBHOOK_EVENT_STATUSES.PROCESSED,
    REVENUECAT_WEBHOOK_EVENT_STATUSES.IGNORED,
    REVENUECAT_WEBHOOK_EVENT_STATUSES.DEAD_LETTER,
] as const;

export const REVENUECAT_TERMINAL_WEBHOOK_EVENT_STATUS_SET: ReadonlySet<RevenueCatWebhookEventStatus> = new Set(
    REVENUECAT_TERMINAL_WEBHOOK_EVENT_STATUSES
);

export type RevenueCatWebhookEventStatus =
    (typeof REVENUECAT_WEBHOOK_EVENT_STATUSES)[keyof typeof REVENUECAT_WEBHOOK_EVENT_STATUSES];

// Retry eligibility is checked by the five-minute webhook retry worker.
export const REVENUECAT_WEBHOOK_RETRY_CONFIG = {
    max_retry_count: 12,
    retry_base_delay_ms: 15_000,
    retry_max_delay_ms: 6 * 60 * 60 * 1000,
} as const;
export const REVENUECAT_RECONCILIATION_FAILURE_BACKOFF_MS = 30 * 60 * 1000;
export const REVENUECAT_EVENTS_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
