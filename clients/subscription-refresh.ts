import { getConvexAccessToken } from "@/clients/auth-client";

type RefreshSubscriptionResponse = {
    ok?: boolean;
    error?: string;
    refresh?: {
        status?: string;
        error?: string;
        has_active_subscription?: boolean;
        plan_key?: "free" | "polyglot";
    };
};

type RefreshSubscriptionResult = NonNullable<RefreshSubscriptionResponse["refresh"]>;

type RefreshSubscriptionStateOptions = {
    expectActiveSubscription?: boolean;
    retryDelaysMs?: readonly number[];
};

const REVENUECAT_UPDATE_REFRESH_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000] as const;
const REVENUECAT_UPDATE_BACKGROUND_REFRESH_RETRY_DELAYS_MS = [15_000, 30_000, 60_000] as const;

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

let backgroundRevenueCatUpdateRefreshPromise: Promise<RefreshSubscriptionResult | null> | null = null;

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

function getRefreshErrorMessage(
    response: RefreshSubscriptionResponse | null,
    responseText: string,
    status: number
) {
    if (typeof response?.error === "string" && response.error.trim().length > 0) {
        return response.error;
    }

    if (typeof response?.refresh?.error === "string" && response.refresh.error.trim().length > 0) {
        return response.refresh.error;
    }

    if (responseText.trim().length > 0) {
        return responseText.trim();
    }

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

async function requestSubscriptionStateRefresh(): Promise<RefreshSubscriptionResult | null> {
    const convexToken = await getConvexAccessToken();

    if (!convexToken) {
        throw new SubscriptionRefreshError("Unable to get Convex auth token");
    }

    const response = await fetch(getRefreshUrl(), {
        method: "POST",
        headers: {
            Accept: "application/json",
            Authorization: `Bearer ${convexToken}`,
        },
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
        throw new SubscriptionRefreshError(
            getRefreshErrorMessage(parsedResponse, responseText, response.status),
            response.status
        );
    }

    return parsedResponse.refresh ?? null;
}

export async function refreshSubscriptionState(
    options: RefreshSubscriptionStateOptions = {}
): Promise<RefreshSubscriptionResult | null> {
    let retryIndex = 0;

    while (true) {
        try {
            const refreshResult = await requestSubscriptionStateRefresh();

            if (options.expectActiveSubscription && refreshResult?.has_active_subscription !== true) {
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
}

export function refreshSubscriptionStateAfterRevenueCatUpdate() {
    return refreshSubscriptionState({
        expectActiveSubscription: true,
        retryDelaysMs: REVENUECAT_UPDATE_REFRESH_RETRY_DELAYS_MS,
    });
}

export function retrySubscriptionStateAfterRevenueCatUpdateInBackground() {
    if (!backgroundRevenueCatUpdateRefreshPromise) {
        backgroundRevenueCatUpdateRefreshPromise = refreshSubscriptionState({
            expectActiveSubscription: true,
            retryDelaysMs: REVENUECAT_UPDATE_BACKGROUND_REFRESH_RETRY_DELAYS_MS,
        }).finally(() => {
            backgroundRevenueCatUpdateRefreshPromise = null;
        });
    }

    return backgroundRevenueCatUpdateRefreshPromise;
}
