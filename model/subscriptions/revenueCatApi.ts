import {
    getOnDemandSubscriptionRefreshIntervalMs,
    getPolyglotEntitlementId,
    getRevenueCatProjectId,
    getRevenueCatEventsRetentionMs,
    parseString,
} from "./config";
import { ABORT_ERROR_NAME } from "../../constants/errors";
import { MAX_PERSISTED_ERROR_MESSAGE_CHARS } from "../../constants/limits";
import type { SubscriptionPlanKey } from "../../constants/subscriptions";

const REVENUECAT_API_ORIGIN = "https://api.revenuecat.com";
const REVENUECAT_API_V2_BASE_URL = `${REVENUECAT_API_ORIGIN}/v2`;
const REVENUECAT_READ_REQUEST_TIMEOUT_MS = 5_000;
const REVENUECAT_DELETE_REQUEST_TIMEOUT_MS = 5_000;
const REVENUECAT_LIST_MAX_PAGES = 10;
const REVENUECAT_RECONCILIATION_MAX_REQUESTS = 10;

type RevenueCatErrorDetails = {
    type?: string;
    message?: string;
    retry_after_ms?: number;
};

export class RevenueCatApiError extends Error {
    readonly status: number;
    readonly retry_after_ms?: number;

    constructor(args: {
        message: string;
        status: number;
        retry_after_ms?: number;
    }) {
        super(args.message);
        this.name = "RevenueCatApiError";
        this.status = args.status;
        this.retry_after_ms = args.retry_after_ms;
    }
}

type RevenueCatReconciliationSnapshot = {
    has_active_subscription: boolean;
    entitlement_id?: string;
    product_id?: string;
    store_subscription_id?: string;
    period_start_at_ms?: number;
    period_end_at_ms?: number;
    store?: string;
    environment?: string;
};

export type CurrentSubscriptionState = {
    user_id: string;
    revenuecat_app_user_id?: string;
    plan_key: SubscriptionPlanKey;
    has_active_subscription: boolean;
    store_subscription_id?: string;
    store_subscription_period_id?: string;
    billing_cycle_end_at_ms?: number;
    last_revenuecat_event_id?: string;
    last_revenuecat_event_at_ms?: number;
    sync_attempt_id?: string;
    sync_started_at_ms?: number;
    sync_expires_at_ms?: number;
    pending_active_signal_at_ms?: number;
    pending_active_expires_at_ms?: number;
    last_synced_at_ms: number;
    stale_after_at_ms: number;
};

export function shouldIgnoreStaleReconciledSubscriptionState(
    state: Pick<CurrentSubscriptionState, "last_synced_at_ms"> | null | undefined,
    incomingSyncedAtMs: number
) {
    return (
        !!state &&
        Number.isFinite(state.last_synced_at_ms) &&
        Number.isFinite(incomingSyncedAtMs) &&
        state.last_synced_at_ms > incomingSyncedAtMs
    );
}

type ParsedRevenueCatSubscription = {
    product_id?: string;
    purchase_at_ms?: number;
    expiration_at_ms?: number;
    store_subscription_id?: string;
    store?: string;
    environment?: string;
    entitlement_ids: string[];
};

type ParsedRevenueCatActiveEntitlement = {
    entitlement_id: string;
    expiration_at_ms?: number;
};

type RevenueCatRequestBudget = {
    request_count: number;
};

async function fetchRevenueCatWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number
) {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...init,
            signal: abortController.signal,
        });
    } catch (error) {
        if ((error as Error).name === ABORT_ERROR_NAME) {
            throw new Error(`RevenueCat request timed out after ${timeoutMs}ms`);
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

function getRevenueCatReadApiV2Key() {
    return parseString(process.env.REVENUECAT_CI_SUBSCRIPTIONS_R_API_KEY);
}

function getRevenueCatDeleteApiV2Key() {
    return parseString(process.env.REVENUECAT_CI_CUSTOMERS_RW_API_KEY);
}

function getRevenueCatReadApiV2Config() {
    const apiKey = getRevenueCatReadApiV2Key();
    const projectId = getRevenueCatProjectId();

    if (!apiKey || projectId.length === 0) {
        return null;
    }

    return {
        api_key: apiKey,
        project_id: projectId,
    };
}

function getRevenueCatDeleteApiV2Config() {
    const apiKey = getRevenueCatDeleteApiV2Key();
    const projectId = getRevenueCatProjectId();

    if (!apiKey || projectId.length === 0) {
        return null;
    }

    return {
        api_key: apiKey,
        project_id: projectId,
    };
}

function getMissingRevenueCatReadApiV2ConfigMessage() {
    if (!getRevenueCatReadApiV2Key()) {
        return "Missing REVENUECAT_CI_SUBSCRIPTIONS_R_API_KEY";
    }

    if (getRevenueCatProjectId().length === 0) {
        return "Missing REVENUECAT_PROJECT_ID";
    }

    return null;
}

export function getMissingRevenueCatEntitlementConfigMessage() {
    const readConfigMessage = getMissingRevenueCatReadApiV2ConfigMessage();
    if (readConfigMessage) {
        return readConfigMessage;
    }

    if (!getPolyglotEntitlementId()) {
        return "Missing REVENUECAT_POLYGLOT_ENTITLEMENT_ID";
    }

    return null;
}

function getMissingRevenueCatDeleteApiV2ConfigMessage() {
    if (!getRevenueCatDeleteApiV2Key()) {
        return "Missing REVENUECAT_CI_CUSTOMERS_RW_API_KEY";
    }

    if (getRevenueCatProjectId().length === 0) {
        return "Missing REVENUECAT_PROJECT_ID";
    }

    return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function parseNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return null;
}

function parseRetryAfterHeaderMs(response: Response) {
    const retryAfterHeader = response.headers?.get?.("Retry-After");

    if (!retryAfterHeader) {
        return undefined;
    }

    const seconds = parseNumber(retryAfterHeader);
    if (seconds !== null) {
        return Math.max(0, Math.floor(seconds * 1000));
    }

    const retryAfterTimestampMs = Date.parse(retryAfterHeader);
    if (Number.isNaN(retryAfterTimestampMs)) {
        return undefined;
    }

    return Math.max(0, retryAfterTimestampMs - Date.now());
}

async function readRevenueCatErrorDetails(response: Response): Promise<RevenueCatErrorDetails> {
    let payload: unknown = null;

    try {
        payload = await response.json();
    } catch {
        payload = null;
    }

    if (!isRecord(payload)) {
        return {
            retry_after_ms: parseRetryAfterHeaderMs(response),
        };
    }

    const backoffMs = parseNumber(payload.backoff_ms);

    return {
        type: parseString(payload.type) ?? undefined,
        message: parseString(payload.message) ?? parseString(payload.type) ?? undefined,
        retry_after_ms: backoffMs !== null
            ? Math.max(0, Math.floor(backoffMs))
            : parseRetryAfterHeaderMs(response),
    };
}

function buildRevenueCatHttpError(args: {
    operation: string;
    status: number;
    details: RevenueCatErrorDetails;
}) {
    const detailMessage = args.details.message ? `: ${args.details.message}` : "";

    return new RevenueCatApiError({
        message: `${args.operation} failed with status ${args.status}${detailMessage}`,
        status: args.status,
        retry_after_ms: args.details.retry_after_ms,
    });
}

function parseTimestampMs(value: unknown): number | null {
    const numberTimestamp = parseNumber(value);
    if (numberTimestamp !== null) {
        return numberTimestamp;
    }

    if (typeof value !== "string" || value.trim().length === 0) {
        return null;
    }

    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
        return null;
    }

    return parsed;
}

function parseIdentifierString(value: unknown) {
    const parsedString = parseString(value);

    if (parsedString) {
        return parsedString;
    }

    const parsedNumber = parseNumber(value);
    return parsedNumber === null ? null : String(parsedNumber);
}

function resolveRevenueCatV2Url(path: string) {
    const url = new URL(
        path.startsWith("http://") || path.startsWith("https://")
            ? path
            : path.startsWith("/v2/")
              ? `${REVENUECAT_API_ORIGIN}${path}`
              : `${REVENUECAT_API_V2_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`
    );

    if (url.origin !== REVENUECAT_API_ORIGIN || !url.pathname.startsWith("/v2/")) {
        throw new Error("Invalid RevenueCat v2 pagination URL");
    }

    return url.toString();
}

export function shouldUseExistingSubscriptionState(
    existingState: CurrentSubscriptionState | null,
    nowMs: number
) {
    if (!existingState) {
        return false;
    }

    if (nowMs - existingState.last_synced_at_ms >= getOnDemandSubscriptionRefreshIntervalMs()) {
        return false;
    }

    if (nowMs >= existingState.stale_after_at_ms) {
        return false;
    }

    if (!existingState.has_active_subscription) {
        return true;
    }

    return (
        typeof existingState.billing_cycle_end_at_ms === "number" &&
        nowMs < existingState.billing_cycle_end_at_ms
    );
}

function parseRevenueCatNextPage(value: unknown, operation: string) {
    if (typeof value === "undefined" || value === null) {
        return "";
    }

    const nextPage = parseString(value);
    if (!nextPage) {
        throw new Error(`${operation} returned an invalid next page`);
    }

    return nextPage;
}

async function fetchRevenueCatList(args: {
    api_key: string;
    initial_path: string;
    operation: string;
    request_budget: RevenueCatRequestBudget;
    missing_resource_is_empty?: boolean;
}) {
    let nextPagePath = args.initial_path;
    const fetchedPagePaths = new Set<string>();
    const items: Record<string, unknown>[] = [];

    while (nextPagePath.length > 0) {
        if (
            fetchedPagePaths.has(nextPagePath) ||
            fetchedPagePaths.size >= REVENUECAT_LIST_MAX_PAGES
        ) {
            throw new Error(`${args.operation} pagination exceeded safety limit`);
        }

        fetchedPagePaths.add(nextPagePath);

        if (args.request_budget.request_count >= REVENUECAT_RECONCILIATION_MAX_REQUESTS) {
            throw new Error("RevenueCat v2 reconciliation request limit exceeded");
        }
        args.request_budget.request_count += 1;

        const response = await fetchRevenueCatWithTimeout(
            resolveRevenueCatV2Url(nextPagePath),
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${args.api_key}`,
                    Accept: "application/json",
                },
            },
            REVENUECAT_READ_REQUEST_TIMEOUT_MS
        );

        if (!response.ok) {
            const details = await readRevenueCatErrorDetails(response);
            if (
                response.status === 404 &&
                details.type === "resource_missing" &&
                args.missing_resource_is_empty === true &&
                fetchedPagePaths.size === 1
            ) {
                return [];
            }

            throw buildRevenueCatHttpError({
                operation: args.operation,
                status: response.status,
                details,
            });
        }

        const payload = (await response.json()) as unknown;
        if (!isRecord(payload) || !Array.isArray(payload.items)) {
            throw new Error(`${args.operation} returned an invalid list response`);
        }

        for (const item of payload.items) {
            if (!isRecord(item)) {
                throw new Error(`${args.operation} returned an invalid list entry`);
            }

            items.push(item);
        }
        nextPagePath = parseRevenueCatNextPage(payload.next_page, args.operation);
    }

    return items;
}

function parseRevenueCatEntitlementIds(subscriptionEntitlements: unknown) {
    if (
        !isRecord(subscriptionEntitlements) ||
        !Array.isArray(subscriptionEntitlements.items)
    ) {
        throw new Error("RevenueCat v2 subscription returned an invalid entitlement list");
    }

    return subscriptionEntitlements.items.map((entitlement) => {
        if (!isRecord(entitlement)) {
            throw new Error("RevenueCat v2 subscription returned an invalid entitlement");
        }

        const entitlementId = parseString(entitlement.id);
        if (!entitlementId) {
            throw new Error("RevenueCat v2 subscription returned an invalid entitlement");
        }

        return entitlementId;
    });
}

async function fetchRevenueCatSubscriptionEntitlementIds(args: {
    api_key: string;
    request_budget: RevenueCatRequestBudget;
    subscription_entitlements: unknown;
}) {
    const entitlementIds = parseRevenueCatEntitlementIds(args.subscription_entitlements);
    const nextPagePath = parseRevenueCatNextPage(
        isRecord(args.subscription_entitlements)
            ? args.subscription_entitlements.next_page
            : undefined,
        "RevenueCat v2 subscription entitlements request"
    );

    if (nextPagePath.length > 0) {
        const remainingEntitlements = await fetchRevenueCatList({
            api_key: args.api_key,
            initial_path: nextPagePath,
            operation: "RevenueCat v2 subscription entitlements request",
            request_budget: args.request_budget,
        });
        entitlementIds.push(...parseRevenueCatEntitlementIds({ items: remainingEntitlements }));
    }

    return Array.from(new Set(entitlementIds));
}

async function fetchRevenueCatCustomerSubscriptions(
    appUserId: string,
    config: { api_key: string; project_id: string },
    requestBudget: RevenueCatRequestBudget
): Promise<ParsedRevenueCatSubscription[]> {
    const encodedProjectId = encodeURIComponent(config.project_id);
    const encodedAppUserId = encodeURIComponent(appUserId);
    const items = await fetchRevenueCatList({
        api_key: config.api_key,
        initial_path: `/projects/${encodedProjectId}/customers/${encodedAppUserId}/subscriptions?limit=100`,
        operation: "RevenueCat v2 subscriptions request",
        request_budget: requestBudget,
        missing_resource_is_empty: true,
    });
    const subscriptions: ParsedRevenueCatSubscription[] = [];

    for (const subscription of items) {
        if (
            !parseString(subscription.id) ||
            typeof subscription.gives_access !== "boolean"
        ) {
            throw new Error("RevenueCat v2 subscriptions request returned an invalid subscription");
        }

        if (!subscription.gives_access) {
            continue;
        }

        subscriptions.push({
            product_id: parseString(subscription.product_id) ?? undefined,
            purchase_at_ms:
                parseTimestampMs(subscription.current_period_starts_at) ??
                parseTimestampMs(subscription.starts_at) ??
                undefined,
            expiration_at_ms: parseTimestampMs(subscription.current_period_ends_at) ?? undefined,
            store_subscription_id:
                parseIdentifierString(subscription.store_subscription_identifier) ?? undefined,
            store: parseString(subscription.store) ?? undefined,
            environment: parseString(subscription.environment) ?? undefined,
            entitlement_ids: await fetchRevenueCatSubscriptionEntitlementIds({
                api_key: config.api_key,
                request_budget: requestBudget,
                subscription_entitlements: subscription.entitlements,
            }),
        });
    }

    return subscriptions;
}

async function fetchRevenueCatCustomerActiveEntitlements(
    appUserId: string,
    config: { api_key: string; project_id: string },
    requestBudget: RevenueCatRequestBudget
): Promise<ParsedRevenueCatActiveEntitlement[]> {
    const encodedProjectId = encodeURIComponent(config.project_id);
    const encodedAppUserId = encodeURIComponent(appUserId);
    const items = await fetchRevenueCatList({
        api_key: config.api_key,
        initial_path:
            `/projects/${encodedProjectId}/customers/${encodedAppUserId}/active_entitlements?limit=100`,
        operation: "RevenueCat v2 active entitlements request",
        request_budget: requestBudget,
        missing_resource_is_empty: true,
    });

    return items.map((entitlement) => {
        const entitlementId = parseString(entitlement.entitlement_id);

        if (!entitlementId || !("expires_at" in entitlement)) {
            throw new Error("RevenueCat v2 active entitlements request returned an invalid entitlement");
        }

        return {
            entitlement_id: entitlementId,
            expiration_at_ms: parseTimestampMs(entitlement.expires_at) ?? undefined,
        };
    });
}

export function formatErrorMessage(error: unknown): string {
    if (typeof error === "object" && error && "message" in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === "string" && message.trim().length > 0) {
            return message.slice(0, MAX_PERSISTED_ERROR_MESSAGE_CHARS);
        }
    }

    return "Unknown error";
}

export function getRevenueCatApiErrorRetryDelayMs(error: unknown) {
    return error instanceof RevenueCatApiError ? error.retry_after_ms : undefined;
}

export function isRevenueCatApiErrorWithStatus(error: unknown, statuses: number[]) {
    return error instanceof RevenueCatApiError && statuses.includes(error.status);
}

export function getRevenueCatEventsRetentionCutoffMs(
    nowMs: number,
    retentionMs = getRevenueCatEventsRetentionMs()
) {
    return nowMs - retentionMs;
}

export async function fetchRevenueCatCustomerSubscriptionSnapshot(
    appUserId: string
): Promise<RevenueCatReconciliationSnapshot> {
    const missingConfigMessage = getMissingRevenueCatEntitlementConfigMessage();
    if (missingConfigMessage) {
        throw new Error(missingConfigMessage);
    }

    const config = getRevenueCatReadApiV2Config();
    const entitlementResourceId = getPolyglotEntitlementId();

    const requestBudget = { request_count: 0 };
    const parsedSubscriptions = await fetchRevenueCatCustomerSubscriptions(
        appUserId,
        config!,
        requestBudget
    );
    const matchingSubscriptions = parsedSubscriptions.filter(
        (subscription) =>
            subscription.entitlement_ids.includes(entitlementResourceId)
    );

    const selectedSubscription = [...matchingSubscriptions].sort((left, right) => {
        const leftExpiration = left.expiration_at_ms ?? 0;
        const rightExpiration = right.expiration_at_ms ?? 0;

        if (leftExpiration !== rightExpiration) {
            return rightExpiration - leftExpiration;
        }

        return (right.purchase_at_ms ?? 0) - (left.purchase_at_ms ?? 0);
    })[0];

    if (!selectedSubscription) {
        return {
            has_active_subscription: false,
        };
    }

    return {
        has_active_subscription: true,
        entitlement_id: entitlementResourceId,
        product_id: selectedSubscription.product_id,
        store_subscription_id: selectedSubscription.store_subscription_id,
        period_start_at_ms: selectedSubscription.purchase_at_ms,
        period_end_at_ms: selectedSubscription.expiration_at_ms,
        store: selectedSubscription.store,
        environment: selectedSubscription.environment,
    };
}

export async function fetchRevenueCatCustomerActiveEntitlementSnapshot(
    appUserId: string
): Promise<RevenueCatReconciliationSnapshot> {
    const missingConfigMessage = getMissingRevenueCatEntitlementConfigMessage();
    if (missingConfigMessage) {
        throw new Error(missingConfigMessage);
    }

    const config = getRevenueCatReadApiV2Config()!;
    const entitlementResourceId = getPolyglotEntitlementId();
    const activeEntitlements = await fetchRevenueCatCustomerActiveEntitlements(
        appUserId,
        config,
        { request_count: 0 }
    );
    const activePolyglotEntitlement = activeEntitlements.find(
        (entitlement) => entitlement.entitlement_id === entitlementResourceId
    );

    return activePolyglotEntitlement
        ? {
              has_active_subscription: true,
              entitlement_id: entitlementResourceId,
              period_end_at_ms: activePolyglotEntitlement.expiration_at_ms,
          }
        : {
              has_active_subscription: false,
          };
}

export async function deleteRevenueCatCustomer(appUserId: string) {
    const config = getRevenueCatDeleteApiV2Config();

    if (!config) {
        throw new Error(
            getMissingRevenueCatDeleteApiV2ConfigMessage() ??
            "Missing RevenueCat customer delete configuration"
        );
    }

    const encodedProjectId = encodeURIComponent(config.project_id);
    const encodedAppUserId = encodeURIComponent(appUserId);
    const response = await fetchRevenueCatWithTimeout(
        resolveRevenueCatV2Url(`/projects/${encodedProjectId}/customers/${encodedAppUserId}`),
        {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${config.api_key}`,
                Accept: "application/json",
            },
        },
        REVENUECAT_DELETE_REQUEST_TIMEOUT_MS
    );

    if (response.status === 404) {
        return {
            deleted: false,
            already_missing: true,
        };
    }

    if (!response.ok) {
        throw buildRevenueCatHttpError({
            operation: "RevenueCat customer delete",
            status: response.status,
            details: await readRevenueCatErrorDetails(response),
        });
    }

    return {
        deleted: true,
    };
}
