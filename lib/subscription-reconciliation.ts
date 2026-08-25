import { ABORT_ERROR_NAME } from "@/constants/errors";
import { HTTP_ROUTES } from "@/constants/http";
import {
    SUBSCRIPTION_PLAN_KEYS,
    type SubscriptionPlanKey,
} from "@/constants/subscription";
import { getConvexAccessToken } from "@/lib/auth-client";
import { getRequiredConvexSiteUrl } from "@/lib/client-config";

const SUBSCRIPTION_RECONCILIATION_STATUSES = {
    ACTIVE: "active",
    INACTIVE: "inactive",
    ACTIVATING: "activating",
    RECONCILING: "reconciling",
} as const;

export type SubscriptionReconciliationStatus =
    (typeof SUBSCRIPTION_RECONCILIATION_STATUSES)[keyof typeof SUBSCRIPTION_RECONCILIATION_STATUSES];

type SubscriptionReconciliationResult = {
    ok: true;
    status: SubscriptionReconciliationStatus;
    subscription: {
        has_active_subscription: boolean;
        plan_key: SubscriptionPlanKey;
    };
};

type ReconcileObservedSubscriptionStateOptions = {
    userId: string;
    observedActive: boolean;
    observationKey?: string;
    accessToken?: string | null;
};

const RECONCILIATION_REQUEST_TIMEOUT_MS = 10_000;
const activeReconciliations = new Map<
    string,
    {
        observationKey: string;
        promise: Promise<SubscriptionReconciliationResult>;
    }
>();

class SubscriptionReconciliationError extends Error {
    readonly status?: number;

    constructor(message: string, status?: number) {
        super(message);
        this.name = "SubscriptionReconciliationError";
        this.status = status;
    }
}

function isSubscriptionReconciliationResult(
    value: unknown
): value is SubscriptionReconciliationResult {
    if (!value || typeof value !== "object") {
        return false;
    }

    const response = value as Record<string, unknown>;
    const subscription = response.subscription;
    return (
        response.ok === true &&
        (response.status === SUBSCRIPTION_RECONCILIATION_STATUSES.ACTIVE ||
            response.status === SUBSCRIPTION_RECONCILIATION_STATUSES.INACTIVE ||
            response.status === SUBSCRIPTION_RECONCILIATION_STATUSES.ACTIVATING ||
            response.status === SUBSCRIPTION_RECONCILIATION_STATUSES.RECONCILING) &&
        Boolean(subscription) &&
        typeof subscription === "object" &&
        typeof (subscription as Record<string, unknown>).has_active_subscription === "boolean" &&
        ((subscription as Record<string, unknown>).plan_key === SUBSCRIPTION_PLAN_KEYS.FREE ||
            (subscription as Record<string, unknown>).plan_key === SUBSCRIPTION_PLAN_KEYS.POLYGLOT)
    );
}

export function isPendingSubscriptionReconciliation(
    status: SubscriptionReconciliationStatus | null | undefined
) {
    return (
        status === SUBSCRIPTION_RECONCILIATION_STATUSES.ACTIVATING ||
        status === SUBSCRIPTION_RECONCILIATION_STATUSES.RECONCILING
    );
}

async function requestReconciliation({
    userId,
    observedActive,
    accessToken,
}: ReconcileObservedSubscriptionStateOptions): Promise<SubscriptionReconciliationResult> {
    const convexToken = accessToken ?? (await getConvexAccessToken());

    if (!convexToken) {
        throw new SubscriptionReconciliationError("Unable to get Convex auth token", 401);
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(
        () => abortController.abort(),
        RECONCILIATION_REQUEST_TIMEOUT_MS
    );

    try {
        const response = await fetch(
            `${getRequiredConvexSiteUrl()}${HTTP_ROUTES.SUBSCRIPTION_RECONCILIATION}`,
            {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${convexToken}`,
                },
                body: JSON.stringify({
                    expected_user_id: userId,
                    observed_active: observedActive,
                }),
                signal: abortController.signal,
            }
        );
        const responseText = await response.text();
        let parsedResponse: unknown = null;

        try {
            parsedResponse = responseText
                ? JSON.parse(responseText)
                : null;
        } catch {
            parsedResponse = null;
        }

        if (!response.ok || !isSubscriptionReconciliationResult(parsedResponse)) {
            const errorMessage =
                parsedResponse &&
                typeof parsedResponse === "object" &&
                typeof (parsedResponse as Record<string, unknown>).error === "string"
                ? (parsedResponse as Record<string, unknown>).error as string
                : undefined;
            throw new SubscriptionReconciliationError(
                errorMessage ?? `Subscription reconciliation failed with status ${response.status}`,
                response.status
            );
        }

        return parsedResponse;
    } catch (error) {
        if ((error as Error).name === ABORT_ERROR_NAME) {
            throw new SubscriptionReconciliationError("Subscription reconciliation timed out", 408);
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

export function isSubscriptionReconciliationAuthMismatch(error: unknown) {
    return error instanceof SubscriptionReconciliationError &&
        (error.status === 401 || error.status === 409);
}

export function reconcileObservedSubscriptionState(
    options: ReconcileObservedSubscriptionStateOptions
): Promise<SubscriptionReconciliationResult> {
    const userId = options.userId.trim();

    if (!userId) {
        return Promise.reject(new SubscriptionReconciliationError("A user ID is required"));
    }

    const activeReconciliation = activeReconciliations.get(userId);
    const observationKey = JSON.stringify([
        options.observationKey ?? String(options.observedActive),
        options.accessToken ?? "current-token",
    ]);

    if (activeReconciliation?.observationKey === observationKey) {
        return activeReconciliation.promise;
    }

    const previousPromise = activeReconciliation?.promise;
    const promise = (previousPromise
        ? previousPromise.catch(() => null)
        : Promise.resolve(null)
    ).then(() => requestReconciliation({ ...options, userId })).finally(() => {
        if (activeReconciliations.get(userId)?.promise === promise) {
            activeReconciliations.delete(userId);
        }
    });

    activeReconciliations.set(userId, {
        observationKey,
        promise,
    });
    return promise;
}
