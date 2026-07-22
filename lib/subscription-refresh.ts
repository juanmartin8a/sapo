import { getConvexAccessToken } from "@/lib/auth-client";
import { ABORT_ERROR_NAME } from "@/constants/errors";

type RefreshSubscriptionResponse = {
    ok?: boolean;
    error?: string;
    retry_after_ms?: number;
    limited_kind?: RefreshCooldownKind;
    refresh?: {
        has_active_subscription?: boolean;
        plan_key?: "free" | "polyglot";
    };
};

type RefreshSubscriptionResult = NonNullable<RefreshSubscriptionResponse["refresh"]>;

type RefreshSubscriptionStateOptions = {
    userId?: string | null;
    accessToken?: string | null;
    expectActiveSubscription?: boolean;
    retryDelaysMs?: readonly number[];
};

type RefreshCooldownKind = "refresh_normal" | "refresh_purchase" | "refresh_daily";

const REVENUECAT_UPDATE_REFRESH_RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;
const REVENUECAT_UPDATE_BACKGROUND_REFRESH_RETRY_DELAYS_MS = [15_000] as const;
const REFRESH_REQUEST_TIMEOUT_MS = 10_000;
const REFRESH_SINGLE_FLIGHT_STALE_MS = 45_000;

class SubscriptionRefreshError extends Error {
    readonly status?: number;
    readonly retryAfterMs?: number;
    readonly limitedKind?: RefreshCooldownKind;

    constructor(
        message: string,
        status?: number,
        options: {
            retryAfterMs?: number;
            limitedKind?: RefreshCooldownKind;
        } = {}
    ) {
        super(message);
        this.name = "SubscriptionRefreshError";
        this.status = status;
        this.retryAfterMs = options.retryAfterMs;
        this.limitedKind = options.limitedKind;
    }
}

class SubscriptionRefreshPendingError extends Error {
    readonly refresh: RefreshSubscriptionResult | null;

    constructor(refresh: RefreshSubscriptionResult | null) {
        super("Subscription refresh completed before RevenueCat reported the active subscription");
        this.name = "SubscriptionRefreshPendingError";
        this.refresh = refresh;
    }
}

type ActiveRefresh = {
    expectsActive: boolean;
    startedAtMs: number;
    promise: Promise<RefreshSubscriptionResult | null>;
};

type ScheduledCooldownRetry = {
    timeoutId: ReturnType<typeof setTimeout>;
};

const REFRESH_COOLDOWN_KINDS = ["refresh_normal", "refresh_purchase", "refresh_daily"] as const;
const activeRefreshesByUserId = new Map<string, ActiveRefresh>();
const refreshCooldownsByUserId = new Map<
    string,
    Partial<Record<RefreshCooldownKind, number>>
>();
const scheduledCooldownRetriesByKey = new Map<string, ScheduledCooldownRetry>();

function sleep(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getRefreshUrl() {
    const baseUrl = process.env.EXPO_PUBLIC_CONVEX_SITE_URL ?? "";

    if (baseUrl.length === 0) {
        throw new Error("Missing EXPO_PUBLIC_CONVEX_SITE_URL");
    }

    return `${baseUrl.replace(/\/$/, "")}/refresh`;
}

function getRefreshErrorMessage(status: number) {
    return `Subscription refresh failed with status ${status}`;
}

function isRefreshCooldownKind(value: unknown): value is RefreshCooldownKind {
    return (
        value === "refresh_normal" ||
        value === "refresh_purchase" ||
        value === "refresh_daily"
    );
}

function parsePositiveNumber(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }

    return null;
}

function getRetryAfterHeaderMs(response: Response) {
    const retryAfterHeader = response.headers.get("Retry-After");

    if (!retryAfterHeader) {
        return undefined;
    }

    const retryAfterSeconds = parsePositiveNumber(retryAfterHeader);
    if (retryAfterSeconds !== null) {
        return Math.ceil(retryAfterSeconds * 1000);
    }

    const retryAfterTimestampMs = Date.parse(retryAfterHeader);
    if (Number.isNaN(retryAfterTimestampMs)) {
        return undefined;
    }

    return Math.max(0, retryAfterTimestampMs - Date.now());
}

function getRetryAfterMs(response: Response, parsedResponse: RefreshSubscriptionResponse | null) {
    const responseRetryAfterMs = parsePositiveNumber(parsedResponse?.retry_after_ms);

    if (responseRetryAfterMs !== null) {
        return Math.ceil(responseRetryAfterMs);
    }

    return getRetryAfterHeaderMs(response);
}

function shouldRetrySubscriptionRefresh(error: unknown) {
    if (error instanceof SubscriptionRefreshPendingError) {
        return true;
    }

    if (!(error instanceof SubscriptionRefreshError)) {
        return true;
    }

    if (typeof error.status !== "number") {
        return true;
    }

    return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
}

async function requestSubscriptionStateRefresh(
    options: Pick<RefreshSubscriptionStateOptions, "accessToken" | "expectActiveSubscription" | "userId">
): Promise<RefreshSubscriptionResult | null> {
    const convexToken = options.accessToken ?? (await getConvexAccessToken());

    if (!convexToken) {
        throw new SubscriptionRefreshError("Unable to get Convex auth token");
    }

    const expectedUserId = options.userId?.trim();
    const requestBody = options.expectActiveSubscription || expectedUserId
        ? JSON.stringify({
              ...(expectedUserId ? { expected_user_id: expectedUserId } : {}),
              ...(options.expectActiveSubscription
                  ? { expects_active_subscription: true }
                  : {}),
          })
        : null;

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), REFRESH_REQUEST_TIMEOUT_MS);
    let response: Response;
    let responseText: string;

    try {
        response = await fetch(getRefreshUrl(), {
            method: "POST",
            headers: {
                Accept: "application/json",
                ...(requestBody ? { "Content-Type": "application/json" } : {}),
                Authorization: `Bearer ${convexToken}`,
            },
            ...(requestBody ? { body: requestBody } : {}),
            signal: abortController.signal,
        });
        responseText = await response.text();
    } catch (error) {
        if ((error as Error).name === ABORT_ERROR_NAME) {
            throw new SubscriptionRefreshError("Subscription refresh timed out", 408);
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);
    }

    let parsedResponse: RefreshSubscriptionResponse | null = null;

    if (responseText.length > 0) {
        try {
            parsedResponse = JSON.parse(responseText) as RefreshSubscriptionResponse;
        } catch {
            parsedResponse = null;
        }
    }

    if (!response.ok || parsedResponse?.ok !== true) {
        throw new SubscriptionRefreshError(getRefreshErrorMessage(response.status), response.status, {
            retryAfterMs: response.status === 429
                ? getRetryAfterMs(response, parsedResponse)
                : undefined,
            limitedKind: isRefreshCooldownKind(parsedResponse?.limited_kind)
                ? parsedResponse.limited_kind
                : undefined,
        });
    }

    return parsedResponse.refresh ?? null;
}

export function getSubscriptionRefreshErrorStatus(error: unknown) {
    return error instanceof SubscriptionRefreshError ? error.status : undefined;
}

function getRefreshKey(userId?: string | null) {
    return userId && userId.trim().length > 0 ? userId : "current";
}

function getRefreshRequestKind(options: Pick<RefreshSubscriptionStateOptions, "expectActiveSubscription">) {
    return options.expectActiveSubscription === true ? "refresh_purchase" : "refresh_normal";
}

function pruneExpiredRefreshCooldowns(key: string, nowMs: number) {
    const cooldowns = refreshCooldownsByUserId.get(key);

    if (!cooldowns) {
        return;
    }

    for (const kind of REFRESH_COOLDOWN_KINDS) {
        if (typeof cooldowns[kind] === "number" && cooldowns[kind] <= nowMs) {
            delete cooldowns[kind];
        }
    }

    if (!REFRESH_COOLDOWN_KINDS.some((kind) => typeof cooldowns[kind] === "number")) {
        refreshCooldownsByUserId.delete(key);
    }
}

function getActiveRefreshCooldownUntilMs(
    key: string,
    requestKind: RefreshCooldownKind,
    nowMs: number
) {
    pruneExpiredRefreshCooldowns(key, nowMs);

    const cooldowns = refreshCooldownsByUserId.get(key);
    if (!cooldowns) {
        return null;
    }

    const cooldownUntilMs = Math.max(
        cooldowns.refresh_daily ?? 0,
        cooldowns[requestKind] ?? 0
    );

    return cooldownUntilMs > nowMs ? cooldownUntilMs : null;
}

function recordRefreshCooldown(
    key: string,
    kind: RefreshCooldownKind,
    retryAfterMs: number
) {
    const cooldownUntilMs = Date.now() + Math.max(0, Math.ceil(retryAfterMs));
    const cooldowns = refreshCooldownsByUserId.get(key) ?? {};

    cooldowns[kind] = Math.max(cooldowns[kind] ?? 0, cooldownUntilMs);
    refreshCooldownsByUserId.set(key, cooldowns);

    return cooldownUntilMs;
}

function scheduleRefreshAfterCooldown(
    key: string,
    options: RefreshSubscriptionStateOptions,
    cooldownUntilMs: number
) {
    if (options.expectActiveSubscription !== true) {
        return;
    }

    const scheduleKey = `${key}:${getRefreshRequestKind(options)}`;
    if (scheduledCooldownRetriesByKey.has(scheduleKey)) {
        return;
    }

    const delayMs = Math.max(0, cooldownUntilMs - Date.now());
    const timeoutId = setTimeout(() => {
        scheduledCooldownRetriesByKey.delete(scheduleKey);
        void refreshSubscriptionState(options).catch(() => null);
    }, delayMs);

    scheduledCooldownRetriesByKey.set(scheduleKey, {
        timeoutId,
    });
}

function startRefresh(
    key: string,
    options: RefreshSubscriptionStateOptions
): Promise<RefreshSubscriptionResult | null> {
    let retryIndex = 0;
    const expectsActive = options.expectActiveSubscription === true;
    const startedAtMs = Date.now();
    const promise = (async () => {
        while (true) {
            try {
                const refreshResult = await requestSubscriptionStateRefresh(options);

                if (expectsActive && refreshResult?.has_active_subscription !== true) {
                    throw new SubscriptionRefreshPendingError(refreshResult);
                }

                return refreshResult;
            } catch (error) {
                if (
                    error instanceof SubscriptionRefreshError &&
                    error.status === 429 &&
                    typeof error.retryAfterMs === "number" &&
                    error.retryAfterMs > 0
                ) {
                    const cooldownUntilMs = recordRefreshCooldown(
                        key,
                        error.limitedKind ?? getRefreshRequestKind(options),
                        error.retryAfterMs
                    );

                    scheduleRefreshAfterCooldown(key, options, cooldownUntilMs);
                    return null;
                }

                const retryDelayMs = options.retryDelaysMs?.[retryIndex];

                if (typeof retryDelayMs !== "number" || !shouldRetrySubscriptionRefresh(error)) {
                    throw error;
                }

                retryIndex += 1;
                await sleep(retryDelayMs);
            }
        }
    })().finally(() => {
        const activeRefresh = activeRefreshesByUserId.get(key);

        if (activeRefresh?.promise === promise) {
            activeRefreshesByUserId.delete(key);
        }
    });

    activeRefreshesByUserId.set(key, {
        expectsActive,
        startedAtMs,
        promise,
    });

    return promise;
}

export async function refreshSubscriptionState(
    options: RefreshSubscriptionStateOptions = {}
): Promise<RefreshSubscriptionResult | null> {
    const key = getRefreshKey(options.userId);
    const requestKind = getRefreshRequestKind(options);
    const activeRefresh = activeRefreshesByUserId.get(key);
    const nowMs = Date.now();

    if (activeRefresh && nowMs - activeRefresh.startedAtMs < REFRESH_SINGLE_FLIGHT_STALE_MS) {
        if (options.expectActiveSubscription === true && activeRefresh.expectsActive) {
            return activeRefresh.promise;
        }

        if (options.expectActiveSubscription !== true && !activeRefresh.expectsActive) {
            return activeRefresh.promise;
        }

        const cooldownUntilMs = getActiveRefreshCooldownUntilMs(key, requestKind, nowMs);

        if (cooldownUntilMs !== null) {
            scheduleRefreshAfterCooldown(key, options, cooldownUntilMs);
            return null;
        }

        return startRefresh(key, options);
    }

    if (activeRefresh) {
        activeRefreshesByUserId.delete(key);
    }

    const cooldownUntilMs = getActiveRefreshCooldownUntilMs(key, requestKind, nowMs);

    if (cooldownUntilMs !== null) {
        scheduleRefreshAfterCooldown(key, options, cooldownUntilMs);
        return null;
    }

    return startRefresh(key, options);
}

export function refreshSubscriptionStateAfterRevenueCatUpdate(userId?: string | null) {
    return refreshSubscriptionState({
        userId,
        expectActiveSubscription: true,
        retryDelaysMs: REVENUECAT_UPDATE_REFRESH_RETRY_DELAYS_MS,
    });
}

export function retrySubscriptionStateAfterRevenueCatUpdateInBackground(userId?: string | null) {
    return refreshSubscriptionState({
        userId,
        expectActiveSubscription: true,
        retryDelaysMs: REVENUECAT_UPDATE_BACKGROUND_REFRESH_RETRY_DELAYS_MS,
    });
}
