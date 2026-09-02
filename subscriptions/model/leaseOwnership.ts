export function getExclusiveLeaseOwnershipFailure(args: {
    current_attempt_id?: string | null;
    attempt_id?: string | null;
    lease_expires_at_ms?: number | null;
    now_ms: number;
}) {
    if (typeof args.attempt_id !== "string") {
        return "owner_required" as const;
    }

    if (
        typeof args.current_attempt_id !== "string" ||
        args.current_attempt_id !== args.attempt_id
    ) {
        return "owner_mismatch" as const;
    }

    if (
        typeof args.lease_expires_at_ms === "number" &&
        args.lease_expires_at_ms <= args.now_ms
    ) {
        return "lease_expired" as const;
    }

    return null;
}
