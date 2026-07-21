import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type UsageEventState = "processing" | "completed" | "failed" | "indeterminate";
export type UsageEventQuotaState = "reserved" | "charged" | "released";

export function canCompleteUsageEvent(args: {
    state: UsageEventState;
    quota_state: UsageEventQuotaState;
}) {
    return (
        (args.state === "processing" || args.state === "indeterminate") &&
        args.quota_state === "charged"
    );
}

export function resolveUsageEventFailureTransition(args: {
    state: UsageEventState;
    quota_state: UsageEventQuotaState;
}) {
    if (args.state !== "processing" && args.state !== "indeterminate") {
        return null;
    }

    if (args.quota_state === "reserved") {
        return {
            state: "failed" as const,
            quota_state: "released" as const,
        };
    }

    if (args.quota_state === "charged") {
        return {
            state: "failed" as const,
            quota_state: "charged" as const,
        };
    }

    return null;
}

export function resolveStaleUsageEventTransition(args: {
    state: UsageEventState;
    quota_state: UsageEventQuotaState;
}) {
    if (args.state !== "processing") {
        return null;
    }

    if (args.quota_state === "reserved") {
        return {
            state: "failed" as const,
            quota_state: "released" as const,
        };
    }

    if (args.quota_state === "charged") {
        return {
            state: "indeterminate" as const,
            quota_state: "charged" as const,
        };
    }

    return null;
}

export async function finalizeStaleUsageEvent(
    ctx: Pick<MutationCtx, "db">,
    args: {
        usage_event_id: Id<"usage_events">;
        now_ms: number;
        watchdog_delay_ms: number;
    }
) {
    const usageEvent = await ctx.db.get(args.usage_event_id);

    if (!usageEvent) {
        return {
            status: "missing" as const,
        };
    }

    if (
        usageEvent.state !== "processing" ||
        args.now_ms < usageEvent.reserved_at_ms + args.watchdog_delay_ms
    ) {
        return {
            status: "skipped" as const,
            state: usageEvent.state,
        };
    }

    const transition = resolveStaleUsageEventTransition(usageEvent);

    if (!transition) {
        return {
            status: "invalid_state" as const,
            state: usageEvent.state,
            quota_state: usageEvent.quota_state,
        };
    }

    if (transition.state === "failed") {
        await ctx.db.patch(usageEvent._id, {
            state: transition.state,
            quota_state: transition.quota_state,
            failed_at_ms: args.now_ms,
            released_at_ms: args.now_ms,
            updated_at_ms: args.now_ms,
        });
        return {
            status: "stale_reserved_marked_failed" as const,
        };
    }

    await ctx.db.patch(usageEvent._id, {
        state: transition.state,
        indeterminate_at_ms: args.now_ms,
        updated_at_ms: args.now_ms,
    });

    return {
        status: "stale_charged_marked_indeterminate" as const,
    };
}
