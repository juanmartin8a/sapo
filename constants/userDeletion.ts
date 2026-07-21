export const USER_DELETION_LATE_AUTH_WAIT_STATUS = "awaiting_auth_delete_late" as const;
export const USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS = "auth_delete_dead_letter" as const;
export const USER_DELETION_CLEANUP_DEAD_LETTER_STATUS = "cleanup_dead_letter" as const;

export const USER_DELETION_QUEUE_STATUSES = [
    "preparing",
    "awaiting_auth_delete",
    USER_DELETION_LATE_AUTH_WAIT_STATUS,
    USER_DELETION_AUTH_DELETE_DEAD_LETTER_STATUS,
    USER_DELETION_CLEANUP_DEAD_LETTER_STATUS,
    "ready_for_cleanup",
    "waiting_for_quiescence",
    "retryable_error",
    "cleanup_in_progress",
] as const;

export const USER_DELETION_CLEANUP_STEPS = [
    "acquired",
    "waiting_for_quiescence",
    "deleting_revenuecat_subscriber",
    "deleting_subscription_data",
    "finalizing_subscription_data",
] as const;
