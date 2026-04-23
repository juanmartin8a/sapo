export type SubscriptionWindow = {
    window_type: "anchored_monthly" | "billing_cycle";
    window_key: string;
    window_start_at_ms: number;
    window_end_at_ms: number;
};

export function addUtcMonthsClamped(anchorMs: number, monthOffset: number) {
    const anchorDate = new Date(anchorMs);
    const totalMonthIndex =
        anchorDate.getUTCFullYear() * 12 + anchorDate.getUTCMonth() + monthOffset;
    const targetYear = Math.floor(totalMonthIndex / 12);
    const targetMonth = totalMonthIndex % 12;
    const lastDayOfMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    const targetDayOfMonth = Math.min(anchorDate.getUTCDate(), lastDayOfMonth);

    return Date.UTC(
        targetYear,
        targetMonth,
        targetDayOfMonth,
        anchorDate.getUTCHours(),
        anchorDate.getUTCMinutes(),
        anchorDate.getUTCSeconds(),
        anchorDate.getUTCMilliseconds()
    );
}

export function getAnchoredMonthlyWindow(
    anchorMs: number,
    currentTimeMs: number
): SubscriptionWindow | null {
    if (!Number.isFinite(anchorMs) || !Number.isFinite(currentTimeMs)) {
        return null;
    }

    const effectiveTimeMs = Math.max(anchorMs, currentTimeMs);
    const anchorDate = new Date(anchorMs);
    const currentDate = new Date(effectiveTimeMs);
    let monthOffset =
        (currentDate.getUTCFullYear() - anchorDate.getUTCFullYear()) * 12 +
        (currentDate.getUTCMonth() - anchorDate.getUTCMonth());
    let windowStart = addUtcMonthsClamped(anchorMs, monthOffset);

    while (monthOffset > 0 && windowStart > effectiveTimeMs) {
        monthOffset -= 1;
        windowStart = addUtcMonthsClamped(anchorMs, monthOffset);
    }

    let windowEnd = addUtcMonthsClamped(anchorMs, monthOffset + 1);

    while (windowEnd <= effectiveTimeMs) {
        monthOffset += 1;
        windowStart = windowEnd;
        windowEnd = addUtcMonthsClamped(anchorMs, monthOffset + 1);
    }

    return {
        window_type: "anchored_monthly",
        window_key: `anchored_monthly:${windowStart}:${windowEnd}`,
        window_start_at_ms: windowStart,
        window_end_at_ms: windowEnd,
    };
}

export function getBillingCycleWindow(startMs: number, endMs: number): SubscriptionWindow | null {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        return null;
    }

    return {
        window_type: "billing_cycle",
        window_key: `billing_cycle:${startMs}:${endMs}`,
        window_start_at_ms: startMs,
        window_end_at_ms: endMs,
    };
}

export function getRequiredAnchoredMonthlyWindow(anchorMs: number, currentTimeMs: number) {
    const anchoredWindow = getAnchoredMonthlyWindow(anchorMs, currentTimeMs);

    if (!anchoredWindow) {
        throw new Error("Free subscription state is missing a valid period anchor");
    }

    return anchoredWindow;
}

export function getRequiredBillingCycleWindow(startMs: number, endMs: number) {
    const billingCycleWindow = getBillingCycleWindow(startMs, endMs);

    if (!billingCycleWindow) {
        throw new Error("Active subscription is missing valid billing cycle bounds");
    }

    return billingCycleWindow;
}

export function isSameLogicalSubscriptionWindow(
    currentWindow: Pick<SubscriptionWindow, "window_key" | "window_type" | "window_start_at_ms"> & {
        store_subscription_period_id?: string;
    },
    nextWindow: Pick<SubscriptionWindow, "window_key" | "window_type" | "window_start_at_ms"> & {
        store_subscription_period_id?: string;
    }
) {
    if (
        currentWindow.store_subscription_period_id &&
        nextWindow.store_subscription_period_id
    ) {
        return currentWindow.store_subscription_period_id === nextWindow.store_subscription_period_id;
    }

    if (currentWindow.window_type !== nextWindow.window_type) {
        return false;
    }

    if (currentWindow.window_key === nextWindow.window_key) {
        return true;
    }

    return (
        currentWindow.window_type === "billing_cycle" &&
        currentWindow.window_start_at_ms === nextWindow.window_start_at_ms
    );
}

export function isSameLogicalQuotaPeriodWindow(
    quotaPeriod: Pick<
        {
            window_key: string;
            window_type: SubscriptionWindow["window_type"];
            period_start_at_ms: number;
            store_subscription_period_id?: string;
        },
        "window_key" | "window_type" | "period_start_at_ms" | "store_subscription_period_id"
    >,
    window: Pick<SubscriptionWindow, "window_key" | "window_type" | "window_start_at_ms"> & {
        store_subscription_period_id?: string;
    }
) {
    if (quotaPeriod.store_subscription_period_id && window.store_subscription_period_id) {
        return quotaPeriod.store_subscription_period_id === window.store_subscription_period_id;
    }

    if (quotaPeriod.window_type !== window.window_type) {
        return false;
    }

    if (quotaPeriod.window_key === window.window_key) {
        return true;
    }

    return (
        window.window_type === "billing_cycle" &&
        quotaPeriod.period_start_at_ms === window.window_start_at_ms
    );
}
