import {
    getOnDemandSubscriptionRefreshIntervalMs,
    getPolyglotEntitlementId,
    getPolyglotProductIds,
    getRevenueCatProjectId,
    getRevenueCatEventsRetentionMs,
    hasPolyglotSubscriptionFilters,
    parseString,
} from "./config";
import { ABORT_ERROR_NAME } from "../../constants/errors";
import { MAX_PERSISTED_ERROR_MESSAGE_CHARS } from "../../constants/limits";
import type { SubscriptionPlanKey } from "../../constants/subscriptions";

const REVENUECAT_API_V2_BASE_URL = "https://api.revenuecat.com/v2";
const REVENUECAT_READ_REQUEST_TIMEOUT_MS = 5_000;
const REVENUECAT_DELETE_REQUEST_TIMEOUT_MS = 5_000;
const REVENUECAT_SUBSCRIPTIONS_MAX_PAGES = 10;

type RevenueCatErrorDetails = {
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
    gives_access?: boolean;
};

type ParsedRevenueCatEntitlement = {
    entitlement_id: string;
    product_id?: string;
    purchase_at_ms?: number;
    expiration_at_ms?: number;
};

type RevenueCatReconciliationCandidate = {
    entitlement_ids: string[];
    product_id?: string;
    purchase_at_ms?: number;
    expiration_at_ms?: number;
    store_subscription_id?: string;
    store?: string;
    environment?: string;
    has_access: boolean;
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

export function getMissingRevenueCatReadApiV2ConfigMessage() {
    if (!getRevenueCatReadApiV2Key()) {
        return "Missing REVENUECAT_CI_SUBSCRIPTIONS_R_API_KEY";
    }

    if (getRevenueCatProjectId().length === 0) {
        return "Missing REVENUECAT_PROJECT_ID";
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

function parseObjectArray(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter(isRecord);
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
    if (path.startsWith("http://") || path.startsWith("https://")) {
        return path;
    }

    return `${REVENUECAT_API_V2_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
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

function parseRevenueCatV2EntitlementIds(subscriptionEntitlements: unknown) {
    if (!isRecord(subscriptionEntitlements)) {
        return [] as string[];
    }

    return Array.from(
        new Set(
            parseObjectArray(subscriptionEntitlements.items).flatMap((entitlement) => [
                parseString(entitlement.id),
                parseString(entitlement.lookup_key),
            ]).filter((entitlementId): entitlementId is string => typeof entitlementId === "string")
        )
    );
}

async function fetchRevenueCatSubscriptions(
    appUserId: string
): Promise<ParsedRevenueCatSubscription[]> {
    const config = getRevenueCatReadApiV2Config();

    if (!config) {
        throw new Error(getMissingRevenueCatReadApiV2ConfigMessage() ?? "Missing RevenueCat v2 read config");
    }

    const encodedProjectId = encodeURIComponent(config.project_id);
    const encodedAppUserId = encodeURIComponent(appUserId);
    let nextPagePath = `/projects/${encodedProjectId}/customers/${encodedAppUserId}/subscriptions?limit=100`;
    const fetchedPagePaths = new Set<string>();
    const subscriptions: {
        subscription_id: string;
        revenuecat_product_id?: string;
        purchase_at_ms?: number;
        expiration_at_ms?: number;
        store_subscription_id?: string;
        store?: string;
        environment?: string;
        entitlement_ids: string[];
        gives_access?: boolean;
    }[] = [];

    while (nextPagePath.length > 0) {
        if (
            fetchedPagePaths.has(nextPagePath) ||
            fetchedPagePaths.size >= REVENUECAT_SUBSCRIPTIONS_MAX_PAGES
        ) {
            throw new Error("RevenueCat v2 subscriptions pagination exceeded safety limit");
        }

        fetchedPagePaths.add(nextPagePath);

        const response = await fetchRevenueCatWithTimeout(
            resolveRevenueCatV2Url(nextPagePath),
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${config.api_key}`,
                    Accept: "application/json",
                },
            },
            REVENUECAT_READ_REQUEST_TIMEOUT_MS
        );

        if (response.status === 404) {
            return [];
        }

        if (!response.ok) {
            throw buildRevenueCatHttpError({
                operation: "RevenueCat v2 subscriptions request",
                status: response.status,
                details: await readRevenueCatErrorDetails(response),
            });
        }

        const payload = (await response.json()) as unknown;
        if (!isRecord(payload)) {
            break;
        }

        for (const subscription of parseObjectArray(payload.items)) {
            const subscriptionId = parseString(subscription.id);
            if (!subscriptionId) {
                continue;
            }

            subscriptions.push({
                subscription_id: subscriptionId,
                revenuecat_product_id: parseString(subscription.product_id) ?? undefined,
                purchase_at_ms:
                    parseTimestampMs(subscription.current_period_starts_at) ??
                    parseTimestampMs(subscription.starts_at) ??
                    undefined,
                expiration_at_ms: parseTimestampMs(subscription.current_period_ends_at) ?? undefined,
                store_subscription_id:
                    parseIdentifierString(subscription.store_subscription_identifier) ?? undefined,
                store: parseString(subscription.store) ?? undefined,
                environment: parseString(subscription.environment) ?? undefined,
                entitlement_ids: parseRevenueCatV2EntitlementIds(subscription.entitlements),
                gives_access:
                    typeof subscription.gives_access === "boolean"
                        ? subscription.gives_access
                        : undefined,
            });
        }

        nextPagePath = parseString(payload.next_page) ?? "";
    }

    return subscriptions.map((subscription) => ({
        product_id: subscription.revenuecat_product_id,
        purchase_at_ms: subscription.purchase_at_ms,
        expiration_at_ms: subscription.expiration_at_ms,
        store_subscription_id: subscription.store_subscription_id,
        store: subscription.store,
        environment: subscription.environment,
        entitlement_ids: subscription.entitlement_ids,
        gives_access: subscription.gives_access,
    }));
}

function buildRevenueCatReconciliationCandidates(
    parsedEntitlements: ParsedRevenueCatEntitlement[],
    parsedSubscriptions: ParsedRevenueCatSubscription[],
    currentTimeMs: number
) {
    const candidates: RevenueCatReconciliationCandidate[] = parsedSubscriptions.map((subscription) => ({
        entitlement_ids: subscription.entitlement_ids,
        product_id: subscription.product_id,
        purchase_at_ms: subscription.purchase_at_ms,
        expiration_at_ms: subscription.expiration_at_ms,
        store_subscription_id: subscription.store_subscription_id,
        store: subscription.store,
        environment: subscription.environment,
        has_access:
            typeof subscription.gives_access === "boolean"
                ? subscription.gives_access
                : typeof subscription.expiration_at_ms !== "number"
                ? true
                : currentTimeMs <= subscription.expiration_at_ms,
    }));

    const trackedProductIds = new Set(
        parsedSubscriptions
            .map((subscription) => subscription.product_id)
            .filter((productId): productId is string => typeof productId === "string")
    );

    for (const entitlement of parsedEntitlements) {
        if (entitlement.product_id && trackedProductIds.has(entitlement.product_id)) {
            continue;
        }

        candidates.push({
            entitlement_ids: [entitlement.entitlement_id],
            product_id: entitlement.product_id,
            purchase_at_ms: entitlement.purchase_at_ms,
            expiration_at_ms: entitlement.expiration_at_ms,
            has_access:
                typeof entitlement.expiration_at_ms !== "number"
                    ? true
                    : currentTimeMs <= entitlement.expiration_at_ms,
        });
    }

    return candidates;
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

export async function fetchRevenueCatSubscriberSnapshot(
    appUserId: string,
    currentTimeMs: number
): Promise<RevenueCatReconciliationSnapshot> {
    const configuredEntitlementId = getPolyglotEntitlementId();
    const configuredProductIds = getPolyglotProductIds();
    const configuredProductIdSet = new Set(configuredProductIds);

    if (!hasPolyglotSubscriptionFilters()) {
        console.error("Missing RevenueCat Polyglot entitlement or product ID");

        return {
            has_active_subscription: false,
        };
    }

    const parsedSubscriptions = await fetchRevenueCatSubscriptions(appUserId);
    const candidates = buildRevenueCatReconciliationCandidates(
        [],
        parsedSubscriptions,
        currentTimeMs
    );

    const matchingCandidates = candidates.filter((candidate) => {
        if (configuredEntitlementId.length > 0) {
            return candidate.entitlement_ids.includes(configuredEntitlementId);
        }

        return typeof candidate.product_id === "string" && configuredProductIdSet.has(candidate.product_id);
    });

    const selectedCandidate = [...matchingCandidates].sort((left, right) => {
        const leftAccessPriority = left.has_access ? 1 : 0;
        const rightAccessPriority = right.has_access ? 1 : 0;

        if (leftAccessPriority !== rightAccessPriority) {
            return rightAccessPriority - leftAccessPriority;
        }

        const leftExpiration = left.expiration_at_ms ?? 0;
        const rightExpiration = right.expiration_at_ms ?? 0;

        if (leftExpiration !== rightExpiration) {
            return rightExpiration - leftExpiration;
        }

        return (right.purchase_at_ms ?? 0) - (left.purchase_at_ms ?? 0);
    })[0];

    if (!selectedCandidate) {
        return {
            has_active_subscription: false,
        };
    }

    const selectedEntitlementId =
        configuredEntitlementId.length > 0
            ? (selectedCandidate.entitlement_ids.includes(configuredEntitlementId)
                ? configuredEntitlementId
                : undefined)
            : selectedCandidate.entitlement_ids[0];

    return {
        has_active_subscription: selectedCandidate.has_access,
        entitlement_id: selectedEntitlementId,
        product_id: selectedCandidate.product_id,
        store_subscription_id: selectedCandidate.store_subscription_id,
        period_start_at_ms: selectedCandidate.purchase_at_ms,
        period_end_at_ms: selectedCandidate.expiration_at_ms,
        store: selectedCandidate.store,
        environment: selectedCandidate.environment,
    };
}

export async function deleteRevenueCatSubscriber(appUserId: string) {
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
            operation: "RevenueCat subscriber delete",
            status: response.status,
            details: await readRevenueCatErrorDetails(response),
        });
    }

    return {
        deleted: true,
    };
}
