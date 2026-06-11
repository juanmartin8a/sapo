import { getConvexAccessToken } from "@/clients/auth-client";

type RefreshSubscriptionResponse = {
    ok?: boolean;
    error?: string;
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

const REVENUECAT_UPDATE_REFRESH_RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;
const REVENUECAT_UPDATE_BACKGROUND_REFRESH_RETRY_DELAYS_MS = [15_000] as const;
const REFRESH_SINGLE_FLIGHT_STALE_MS = 45_000;

class SubscriptionRefreshError extends Error {
    readonly status?: number;

    constructor(message: string, status?: number) {
        super(message);
        this.name = "SubscriptionRefreshError";
        this.status = status;
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

const activeRefreshesByUserId = new Map<string, ActiveRefresh>();

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

    const response = await fetch(getRefreshUrl(), {
        method: "POST",
        headers: {
            Accept: "application/json",
            ...(requestBody ? { "Content-Type": "application/json" } : {}),
            Authorization: `Bearer ${convexToken}`,
        },
        ...(requestBody ? { body: requestBody } : {}),
    });

    const responseText = await response.text();
    let parsedResponse: RefreshSubscriptionResponse | null = null;

    if (responseText.length > 0) {
        try {
            parsedResponse = JSON.parse(responseText) as RefreshSubscriptionResponse;
        } catch {
            parsedResponse = null;
        }
    }

    if (!response.ok || parsedResponse?.ok !== true) {
        throw new SubscriptionRefreshError(getRefreshErrorMessage(response.status), response.status);
    }

    return parsedResponse.refresh ?? null;
}

export function getSubscriptionRefreshErrorStatus(error: unknown) {
    return error instanceof SubscriptionRefreshError ? error.status : undefined;
}

function getRefreshKey(userId?: string | null) {
    return userId && userId.trim().length > 0 ? userId : "current";
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
    const activeRefresh = activeRefreshesByUserId.get(key);
    const nowMs = Date.now();

    if (activeRefresh && nowMs - activeRefresh.startedAtMs < REFRESH_SINGLE_FLIGHT_STALE_MS) {
        if (options.expectActiveSubscription === true && activeRefresh.expectsActive) {
            return activeRefresh.promise;
        }

        if (options.expectActiveSubscription !== true && !activeRefresh.expectsActive) {
            return activeRefresh.promise;
        }

        return startRefresh(key, options);
    }

    if (activeRefresh) {
        activeRefreshesByUserId.delete(key);
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
