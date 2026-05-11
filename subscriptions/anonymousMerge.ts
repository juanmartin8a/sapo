import {
    getRequiredAnchoredMonthlyWindow,
    type SubscriptionWindow,
} from "./subscriptionWindows";

export type AnonymousMergeStateLike = {
    plan_key: "free" | "polyglot";
    has_active_subscription: boolean;
    free_period_anchor_at_ms?: number;
    billing_cycle_end_at_ms?: number;
    window_start_at_ms: number;
    window_end_at_ms: number;
    revenuecat_app_user_id?: string;
    last_revenuecat_event_id?: string;
    last_revenuecat_event_at_ms?: number;
    store_subscription_id?: string;
    store_subscription_period_id?: string;
};

export type AnonymousMergeQuotaPeriodLike = {
    plan_key: "free" | "polyglot";
    active_subscription: boolean;
    window_type: SubscriptionWindow["window_type"];
    period_start_at_ms: number;
    period_end_at_ms: number;
};

export type AnonymousMergeUsageEventLike = {
    reserved_at_ms: number;
};

export type AnonymousMergeTimelineAuthority = "source" | "target";

function isFiniteTimestampMs(value: number | undefined): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isFreeQuotaPeriod(quotaPeriod: AnonymousMergeQuotaPeriodLike) {
    return !quotaPeriod.active_subscription && quotaPeriod.window_type === "anchored_monthly";
}

function getMostRecentQuotaPeriod(
    quotaPeriods: AnonymousMergeQuotaPeriodLike[],
    matcher: (quotaPeriod: AnonymousMergeQuotaPeriodLike) => boolean
) {
    return (
        [...quotaPeriods]
            .filter(matcher)
            .sort((left, right) => {
                if (left.period_end_at_ms !== right.period_end_at_ms) {
                    return right.period_end_at_ms - left.period_end_at_ms;
                }

                return right.period_start_at_ms - left.period_start_at_ms;
            })[0] ?? null
    );
}

export function hasQuotaSubsystemHistory(args: {
    state: AnonymousMergeStateLike | null;
    quotaPeriods: AnonymousMergeQuotaPeriodLike[];
    usageEvents: AnonymousMergeUsageEventLike[];
}) {
    if (args.quotaPeriods.length > 0 || args.usageEvents.length > 0) {
        return true;
    }

    const { state } = args;

    if (!state) {
        return false;
    }

    return (
        state.has_active_subscription ||
        typeof state.revenuecat_app_user_id === "string" ||
        typeof state.last_revenuecat_event_id === "string" ||
        isFiniteTimestampMs(state.last_revenuecat_event_at_ms) ||
        typeof state.store_subscription_id === "string" ||
        typeof state.store_subscription_period_id === "string"
    );
}

export function resolveAnonymousFreeMergeAuthority(args: {
    targetState: AnonymousMergeStateLike | null;
    targetQuotaPeriods: AnonymousMergeQuotaPeriodLike[];
    targetUsageEvents: AnonymousMergeUsageEventLike[];
}): AnonymousMergeTimelineAuthority {
    return hasQuotaSubsystemHistory({
        state: args.targetState,
        quotaPeriods: args.targetQuotaPeriods,
        usageEvents: args.targetUsageEvents,
    })
        ? "target"
        : "source";
}

function resolveStateFreeAnchorCandidate(state: AnonymousMergeStateLike | null) {
    if (!state) {
        return undefined;
    }

    if (!state.has_active_subscription) {
        return state.free_period_anchor_at_ms ?? state.window_start_at_ms;
    }

    return state.billing_cycle_end_at_ms ?? state.window_end_at_ms;
}

function resolveQuotaPeriodFreeAnchorCandidate(quotaPeriods: AnonymousMergeQuotaPeriodLike[]) {
    const latestFreeQuotaPeriod = getMostRecentQuotaPeriod(quotaPeriods, isFreeQuotaPeriod);

    if (latestFreeQuotaPeriod) {
        return latestFreeQuotaPeriod.period_start_at_ms;
    }

    const latestPaidQuotaPeriod = getMostRecentQuotaPeriod(
        quotaPeriods,
        (quotaPeriod) => quotaPeriod.active_subscription
    );

    return latestPaidQuotaPeriod?.period_end_at_ms;
}

export function resolvePreferredFreeAnchorAtMs(args: {
    state: AnonymousMergeStateLike | null;
    quotaPeriods: AnonymousMergeQuotaPeriodLike[];
}) {
    const anchorCandidate =
        resolveStateFreeAnchorCandidate(args.state) ??
        resolveQuotaPeriodFreeAnchorCandidate(args.quotaPeriods);

    return isFiniteTimestampMs(anchorCandidate) ? anchorCandidate : null;
}

export function resolveCanonicalFreeAnchorAtMs(args: {
    authority: AnonymousMergeTimelineAuthority;
    sourceState: AnonymousMergeStateLike | null;
    targetState: AnonymousMergeStateLike | null;
    sourceQuotaPeriods: AnonymousMergeQuotaPeriodLike[];
    targetQuotaPeriods: AnonymousMergeQuotaPeriodLike[];
}) {
    const primaryAnchorCandidate =
        args.authority === "source"
            ? resolvePreferredFreeAnchorAtMs({
                  state: args.sourceState,
                  quotaPeriods: args.sourceQuotaPeriods,
              })
            : resolvePreferredFreeAnchorAtMs({
                  state: args.targetState,
                  quotaPeriods: args.targetQuotaPeriods,
              });

    if (isFiniteTimestampMs(primaryAnchorCandidate ?? undefined)) {
        return primaryAnchorCandidate;
    }

    const fallbackAnchorCandidate =
        args.authority === "source"
            ? resolvePreferredFreeAnchorAtMs({
                  state: args.targetState,
                  quotaPeriods: args.targetQuotaPeriods,
              })
            : resolvePreferredFreeAnchorAtMs({
                  state: args.sourceState,
                  quotaPeriods: args.sourceQuotaPeriods,
              });

    return fallbackAnchorCandidate;
}

export function getUsageEventOwnershipTimestampMs(event: { reserved_at_ms: number }) {
    return event.reserved_at_ms;
}

export function resolveRebucketedFreeUsageWindow(args: {
    free_period_anchor_at_ms: number;
    event: {
        reserved_at_ms: number;
    };
}) {
    return getRequiredAnchoredMonthlyWindow(
        args.free_period_anchor_at_ms,
        getUsageEventOwnershipTimestampMs(args.event)
    );
}
