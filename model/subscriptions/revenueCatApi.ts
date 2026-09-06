import { REVENUECAT_EVENTS_RETENTION_MS } from "../../constants/revenueCat";
import {
    getOnDemandSubscriptionRefreshIntervalMs,
    getPolyglotEntitlementId,
    getRevenueCatProjectId,
} from "./config";
import { ABORT_ERROR_NAME } from "../../constants/errors";
import {
    isRecord,
    parseFiniteNumber,
    parseIdentifierString,
    parseString,
    parseTimestampMs,
} from "../valueParsing";
import {
    SUBSCRIPTION_RENEWAL_PROPAGATION_GRACE_MS,
    type SubscriptionPlanKey,
} from "../../constants/subscriptions";

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
    access_expires_at_ms?: number;
    subscription_status?: string;
    revenuecat_customer_id?: string;
    revenuecat_subscription_id?: string;
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
    revenuecat_customer_id?: string;
    revenuecat_subscription_id?: string;
    plan_key: SubscriptionPlanKey;
    has_active_subscription: boolean;
    store_subscription_id?: string;
    store_subscription_period_id?: string;
    billing_cycle_end_at_ms?: number;
    access_expires_at_ms?: number;
    last_revenuecat_event_id?: string;
    last_revenuecat_event_at_ms?: number;
    sync_attempt_id?: string;
    sync_started_at_ms?: number;
    sync_expires_at_ms?: number;
    pending_active_signal_at_ms?: number;
    pending_active_expires_at_ms?: number;
    last_synced_at_ms: number;
    next_refresh_attempt_at_ms?: number;
};

export function hasUnexpiredSubscriptionAccess(
    state:
        | Pick<
              CurrentSubscriptionState,
              "has_active_subscription" | "access_expires_at_ms" | "billing_cycle_end_at_ms"
          >
        | null
        | undefined,
    nowMs: number
) {
    const accessExpiresAtMs = getSubscriptionAccessExpiresAtMs(state);

    return (
        state?.has_active_subscription === true &&
        typeof accessExpiresAtMs === "number" &&
        nowMs < accessExpiresAtMs
    );
}

export function getSubscriptionAccessExpiresAtMs(
    state:
        | Pick<CurrentSubscriptionState, "access_expires_at_ms" | "billing_cycle_end_at_ms">
        | null
        | undefined
) {
    const confirmedExpiresAtMs = state?.access_expires_at_ms ?? state?.billing_cycle_end_at_ms;

    return typeof confirmedExpiresAtMs === "number" && Number.isFinite(confirmedExpiresAtMs)
        ? confirmedExpiresAtMs + SUBSCRIPTION_RENEWAL_PROPAGATION_GRACE_MS
        : null;
}

export function hasUnexpiredConfirmedSubscriptionPeriod(
    state:
        | Pick<
              CurrentSubscriptionState,
              "has_active_subscription" | "access_expires_at_ms" | "billing_cycle_end_at_ms"
          >
        | null
        | undefined,
    nowMs: number
) {
    const confirmedExpiresAtMs = state?.access_expires_at_ms ?? state?.billing_cycle_end_at_ms;

    return (
        state?.has_active_subscription === true &&
        typeof confirmedExpiresAtMs === "number" &&
        Number.isFinite(confirmedExpiresAtMs) &&
        nowMs < confirmedExpiresAtMs
    );
}

export function resolveRevenueCatAccessExpirationAtMs(args: {
    subscription_status?: string;
    period_end_at_ms?: number;
    entitlement_expires_at_ms?: number;
}) {
    return shouldUseRevenueCatEntitlementExpiration(args.subscription_status)
        ? args.entitlement_expires_at_ms
        : args.period_end_at_ms;
}

export function shouldUseRevenueCatEntitlementExpiration(subscriptionStatus?: string) {
    return (
        !!subscriptionStatus &&
        subscriptionStatus !== "active" &&
        subscriptionStatus !== "trialing"
    );
}

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
    id: string;
    customer_id?: string;
    gives_access: boolean;
    status?: string;
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

function parseRetryAfterHeaderMs(response: Response) {
    const retryAfterHeader = response.headers?.get?.("Retry-After");

    if (!retryAfterHeader) {
        return undefined;
    }

    const seconds = parseFiniteNumber(retryAfterHeader);
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

    const backoffMs = parseFiniteNumber(payload.backoff_ms);

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

    if (!existingState.has_active_subscription) {
        return true;
    }

    return hasUnexpiredSubscriptionAccess(existingState, nowMs);
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
    missing_customer_is_empty?: boolean;
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
                args.missing_customer_is_empty === true &&
                details.type === "resource_missing" &&
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

async function parseRevenueCatSubscription(args: {
    subscription: Record<string, unknown>;
    api_key: string;
    request_budget: RevenueCatRequestBudget;
    operation: string;
}) {
    const id = parseString(args.subscription.id);
    if (!id || typeof args.subscription.gives_access !== "boolean") {
        throw new Error(`${args.operation} returned an invalid subscription`);
    }

    const givesAccess = args.subscription.gives_access;

    return {
        id,
        customer_id: parseString(args.subscription.customer_id) ?? undefined,
        gives_access: givesAccess,
        status: parseString(args.subscription.status) ?? undefined,
        product_id: parseString(args.subscription.product_id) ?? undefined,
        purchase_at_ms:
            parseTimestampMs(args.subscription.current_period_starts_at) ?? undefined,
        expiration_at_ms:
            parseTimestampMs(args.subscription.current_period_ends_at) ?? undefined,
        store_subscription_id:
            parseIdentifierString(args.subscription.store_subscription_identifier) ?? undefined,
        store: parseString(args.subscription.store) ?? undefined,
        environment: parseString(args.subscription.environment) ?? undefined,
        entitlement_ids: givesAccess
            ? await fetchRevenueCatSubscriptionEntitlementIds({
                  api_key: args.api_key,
                  request_budget: args.request_budget,
                  subscription_entitlements: args.subscription.entitlements,
              })
            : [],
    } satisfies ParsedRevenueCatSubscription;
}

async function fetchRevenueCatSubscriptionById(
    subscriptionId: string,
    config: { api_key: string; project_id: string },
    requestBudget: RevenueCatRequestBudget
) {
    if (requestBudget.request_count >= REVENUECAT_RECONCILIATION_MAX_REQUESTS) {
        throw new Error("RevenueCat v2 reconciliation request limit exceeded");
    }
    requestBudget.request_count += 1;

    const encodedProjectId = encodeURIComponent(config.project_id);
    const encodedSubscriptionId = encodeURIComponent(subscriptionId);
    const operation = "RevenueCat v2 subscription request";
    const response = await fetchRevenueCatWithTimeout(
        resolveRevenueCatV2Url(
            `/projects/${encodedProjectId}/subscriptions/${encodedSubscriptionId}`
        ),
        {
            method: "GET",
            headers: {
                Authorization: `Bearer ${config.api_key}`,
                Accept: "application/json",
            },
        },
        REVENUECAT_READ_REQUEST_TIMEOUT_MS
    );

    if (!response.ok) {
        const details = await readRevenueCatErrorDetails(response);
        if (response.status === 404 && details.type === "resource_missing") {
            return null;
        }

        throw buildRevenueCatHttpError({
            operation,
            status: response.status,
            details,
        });
    }

    const payload = (await response.json()) as unknown;
    if (!isRecord(payload)) {
        throw new Error(`${operation} returned an invalid response`);
    }

    const subscription = await parseRevenueCatSubscription({
        subscription: payload,
        api_key: config.api_key,
        request_budget: requestBudget,
        operation,
    });

    return subscription.id === subscriptionId ? subscription : null;
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
        missing_customer_is_empty: true,
    });
    const subscriptions: ParsedRevenueCatSubscription[] = [];

    for (const subscription of items) {
        const parsedSubscription = await parseRevenueCatSubscription({
            subscription,
            api_key: config.api_key,
            request_budget: requestBudget,
            operation: "RevenueCat v2 subscriptions request",
        });

        if (!parsedSubscription.gives_access) {
            continue;
        }

        subscriptions.push(parsedSubscription);
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
        missing_customer_is_empty: true,
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

export function getRevenueCatApiErrorRetryDelayMs(error: unknown) {
    return error instanceof RevenueCatApiError ? error.retry_after_ms : undefined;
}

export function isRevenueCatApiErrorWithStatus(error: unknown, statuses: number[]) {
    return error instanceof RevenueCatApiError && statuses.includes(error.status);
}

export function getRevenueCatEventsRetentionCutoffMs(
    nowMs: number,
    retentionMs = REVENUECAT_EVENTS_RETENTION_MS
) {
    return nowMs - retentionMs;
}

export async function fetchRevenueCatCustomerSubscriptionSnapshot(
    appUserId: string,
    options: {
        revenuecat_customer_id?: string;
        revenuecat_subscription_id?: string;
        active_entitlement_snapshot?: Pick<
            RevenueCatReconciliationSnapshot,
            "has_active_subscription" | "access_expires_at_ms"
        >;
    } = {}
): Promise<RevenueCatReconciliationSnapshot> {
    const missingConfigMessage = getMissingRevenueCatEntitlementConfigMessage();
    if (missingConfigMessage) {
        throw new Error(missingConfigMessage);
    }

    const config = getRevenueCatReadApiV2Config();
    const entitlementResourceId = getPolyglotEntitlementId();

    let selectedSubscription: ParsedRevenueCatSubscription | undefined;

    if (options.revenuecat_subscription_id) {
        const directSubscription = await fetchRevenueCatSubscriptionById(
            options.revenuecat_subscription_id,
            config!,
            { request_count: 0 }
        );
        const activeEntitlementSnapshot = options.active_entitlement_snapshot;
        const resolvedAccessExpirationAtMs = directSubscription
            ? resolveRevenueCatAccessExpirationAtMs({
                  subscription_status: directSubscription.status,
                  period_end_at_ms: directSubscription.expiration_at_ms,
                  entitlement_expires_at_ms:
                      activeEntitlementSnapshot?.access_expires_at_ms,
              })
            : undefined;
        const matchesActiveEntitlement =
            activeEntitlementSnapshot?.has_active_subscription === true &&
            resolvedAccessExpirationAtMs === activeEntitlementSnapshot.access_expires_at_ms;
        const hasValidBillingBounds =
            typeof directSubscription?.purchase_at_ms === "number" &&
            typeof directSubscription.expiration_at_ms === "number" &&
            directSubscription.expiration_at_ms > directSubscription.purchase_at_ms;

        if (
            directSubscription?.customer_id ===
                (options.revenuecat_customer_id ?? appUserId) &&
            directSubscription.gives_access &&
            directSubscription.entitlement_ids.includes(entitlementResourceId) &&
            matchesActiveEntitlement &&
            hasValidBillingBounds
        ) {
            selectedSubscription = directSubscription;
        }
    }

    if (!selectedSubscription) {
        const parsedSubscriptions = await fetchRevenueCatCustomerSubscriptions(
            appUserId,
            config!,
            { request_count: 0 }
        );
        const matchingSubscriptions = parsedSubscriptions.filter((subscription) =>
            subscription.entitlement_ids.includes(entitlementResourceId)
        );

        selectedSubscription = [...matchingSubscriptions].sort((left, right) => {
            const leftExpiration = left.expiration_at_ms ?? 0;
            const rightExpiration = right.expiration_at_ms ?? 0;

            if (leftExpiration !== rightExpiration) {
                return rightExpiration - leftExpiration;
            }

            return (right.purchase_at_ms ?? 0) - (left.purchase_at_ms ?? 0);
        })[0];
    }

    if (!selectedSubscription) {
        return {
            has_active_subscription: false,
        };
    }

    return {
        has_active_subscription: true,
        subscription_status: selectedSubscription.status,
        ...(selectedSubscription.customer_id
            ? { revenuecat_customer_id: selectedSubscription.customer_id }
            : {}),
        revenuecat_subscription_id: selectedSubscription.id,
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
        (entitlement) =>
            entitlement.entitlement_id === entitlementResourceId &&
            (typeof entitlement.expiration_at_ms !== "number" ||
                Date.now() < entitlement.expiration_at_ms)
    );

    return activePolyglotEntitlement
        ? {
              has_active_subscription: true,
              entitlement_id: entitlementResourceId,
              access_expires_at_ms: activePolyglotEntitlement.expiration_at_ms,
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

    if (!response.ok) {
        const details = await readRevenueCatErrorDetails(response);
        if (
            response.status === 404 &&
            details.type === "resource_missing"
        ) {
            return {
                deleted: false,
                already_missing: true,
            };
        }

        throw buildRevenueCatHttpError({
            operation: "RevenueCat customer delete",
            status: response.status,
            details,
        });
    }

    return {
        deleted: true,
    };
}
