export type UsageEventQuotaAppliedPatch = {
    charged_units: number;
    charged_at_ms: number;
    quota_applied_at_ms: number;
    updated_at_ms: number;
    state?: "processing";
};

export function buildUsageEventQuotaAppliedPatch(args: {
    state: string;
    charged_units: number;
    charged_at_ms?: number;
    now_ms: number;
}): UsageEventQuotaAppliedPatch {
    const patch: UsageEventQuotaAppliedPatch = {
        charged_units: args.charged_units,
        charged_at_ms: args.charged_at_ms ?? args.now_ms,
        quota_applied_at_ms: args.now_ms,
        updated_at_ms: args.now_ms,
    };

    if (args.state === "reserved") {
        patch.state = "processing";
    }

    return patch;
}

export function shouldApplyUsageEventChargeBeforeDeletion(args: {
    matches_preserved_logical_window: boolean;
    is_charged: boolean;
    quota_applied_at_ms?: number;
}) {
    return (
        args.matches_preserved_logical_window &&
        args.is_charged &&
        typeof args.quota_applied_at_ms !== "number"
    );
}
