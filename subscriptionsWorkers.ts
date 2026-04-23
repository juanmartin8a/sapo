import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalAction, internalQuery, type ActionCtx } from "./_generated/server";

import {
    getPolyglotEntitlementId,
    getPolyglotProductIds,
    getOnDemandSubscriptionRefreshIntervalMs,
    getReconciliationBatchLimit,
    getReconciliationFailureBackoffMs,
    getRetryBatchLimit,
    getSubscriptionProcessingConfig,
    getWebhookRetryConfig,
    parseString,
} from "./subscriptionsConfig";
import {
    resolveUserDeletionFinalizationDecision,
    type UserDeletionCleanupStatus,
} from "./subscriptions/userDeletionFinalization";

const REVENUECAT_API_BASE_URL = "https://api.revenuecat.com/v1";
const REVENUECAT_EVENTS_RETENTION_MONTHS = 3;
const RETENTION_PURGE_BATCH_LIMIT_PER_STATUS = 500;
const USER_DELETION_QUIESCENCE_POLL_INTERVAL_MS = 250;
const USER_DELETION_QUIESCENCE_WAIT_TIMEOUT_MS = 5_000;
const USER_DELETION_FORCE_STOP_SETTLE_TIMEOUT_MS = 2_000;

function getRevenueCatReadApiKey() {
    return parseString(process.env.REVENUECAT_SUBSCRIPTIONS_READ_API_KEY);
}

function getRevenueCatDeleteApiKey() {
    return (
        parseString(process.env.REVENUECAT_SUBSCRIPTIONS_DELETE_API_KEY) ??
        getRevenueCatReadApiKey()
    );
}

const DEFAULT_PLAN_LIMITS = [
    {
        plan_key: "free" as const,
        translate_input_char_limit: 10,
        respell_input_char_limit: 10,
        translate_monthly_char_limit: 3_000,
        respell_monthly_char_limit: 3_000,
        is_active: true,
    },
    {
        plan_key: "polyglot" as const,
        translate_input_char_limit: 1_000,
        respell_input_char_limit: 300,
        translate_monthly_char_limit: 120_000,
        respell_monthly_char_limit: 30_000,
        is_active: true,
    },
];

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

type CurrentSubscriptionState = {
    user_id: string;
    revenuecat_app_user_id?: string;
    plan_key: "free" | "polyglot";
    has_active_subscription: boolean;
    store_subscription_id?: string;
    store_subscription_period_id?: string;
    billing_cycle_end_at_ms?: number;
    last_synced_at_ms: number;
    stale_after_at_ms: number;
};

type UserDeletionSnapshot = {
    has_active_subscription: boolean;
    revenuecat_app_user_id?: string;
    current_quota_period_id?: string;
    store_subscription_id?: string;
    store_subscription_period_id?: string;
};

type UserDeletionContext = {
    has_active_subscription: boolean;
    revenuecat_app_user_id?: string;
    preserved_quota_period_id?: string;
    store_subscription_id?: string;
    store_subscription_period_id?: string;
};

type ParsedRevenueCatSubscription = {
    product_id?: string;
    purchase_at_ms?: number;
    expiration_at_ms?: number;
    store_subscription_id?: string;
    store?: string;
    environment?: string;
    entitlement_ids: string[];
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

type SubscriptionStateRefreshResult =
    | {
          status: "already_fresh" | "created" | "updated" | "unchanged";
          revenuecat_app_user_id: string;
          plan_key: "free" | "polyglot";
          has_active_subscription: boolean;
          last_synced_at_ms: number;
          billing_cycle_end_at_ms?: number;
      }
      | {
          status: "user_missing";
          revenuecat_app_user_id: string;
      }
    | {
          status: "deletion_in_progress";
          revenuecat_app_user_id: string;
      }
    | {
          status: "refresh_failed";
          revenuecat_app_user_id: string;
          error: string;
          should_block_requests: boolean;
          plan_key?: "free" | "polyglot";
          has_active_subscription?: boolean;
          last_synced_at_ms?: number;
          billing_cycle_end_at_ms?: number;
      };

type RevenueCatWebhookEventForProcessing = {
    event_id: string;
    event_type: string;
    status: "pending" | "failed" | "processed" | "ignored" | "dead_letter";
    user_id?: string;
    transaction_id?: string;
    target_user_ids: string[];
};

type SubscriptionStateReconciliationCtx = Pick<ActionCtx, "runQuery" | "runMutation">;

function resolveStoreSubscriptionIdHintFromRevenueCatEvent(
    eventDoc: Pick<RevenueCatWebhookEventForProcessing, "event_type" | "transaction_id">
) {
    if (eventDoc.event_type === "TEMPORARY_ENTITLEMENT_GRANT") {
        return undefined;
    }

    return eventDoc.transaction_id;
}

async function getBetterAuthUserCreatedAtMs(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string
) {
    const user = (await (ctx as any).runQuery(components.betterAuth.adapter.findOne, {
        model: "user",
        where: [{ field: "_id", value: userId }],
    })) as { createdAt?: number } | null;

    return {
        exists: user !== null,
        created_at_ms: typeof user?.createdAt === "number" ? user.createdAt : undefined,
    };
}

async function getUserDeletionSnapshotByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string
) {
    return (await (ctx as any).runQuery(components.subscriptions.webhook.getUserDeletionSnapshot, {
        user_id: userId,
    })) as UserDeletionSnapshot;
}

async function getPreparedUserDeletionContextByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string
) {
    return (await (ctx as any).runQuery(
        (components.subscriptions.webhook as Record<string, unknown>).getPreparedUserDeletionContext,
        {
            user_id: userId,
        }
    )) as UserDeletionContext | null;
}

async function getUserDeletionCleanupStatusByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string
) {
    return (await (ctx as any).runQuery(
        (components.subscriptions.webhook as Record<string, unknown>).getUserDeletionCleanupStatus,
        {
            user_id: userId,
        }
    )) as UserDeletionCleanupStatus;
}

async function getUserDeletionOperationStateByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string
) {
    return (await (ctx as any).runQuery(
        (components.subscriptions.webhook as Record<string, unknown>).getUserDeletionOperationState,
        {
            user_id: userId,
        }
    )) as {
        in_progress: boolean;
        started_at_ms?: number;
        updated_at_ms?: number;
    };
}

async function startUserDeletionOperationByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string,
    nowMs: number
) {
    return (await (ctx as any).runMutation(
        (components.subscriptions.webhook as Record<string, unknown>).startUserDeletionOperation,
        {
            user_id: userId,
            now_ms: nowMs,
        }
    )) as {
        in_progress: boolean;
        started_at_ms: number;
        updated_at_ms: number;
    };
}

async function clearUserDeletionOperationByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string
) {
    return (await (ctx as any).runMutation(
        (components.subscriptions.webhook as Record<string, unknown>).clearUserDeletionOperation,
        {
            user_id: userId,
        }
    )) as {
        deleted_count: number;
    };
}

async function clearUserDeletionPreparationByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string
) {
    return (await (ctx as any).runMutation(
        (components.subscriptions.webhook as Record<string, unknown>).clearUserDeletionPreparation,
        {
            user_id: userId,
        }
    )) as {
        deleted_count: number;
    };
}

async function getActiveUserDeletionUsageEventCountByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string
) {
    return (await (ctx as any).runQuery(
        (components.subscriptions.webhook as Record<string, unknown>)
            .getActiveUserDeletionUsageEventCount,
        {
            user_id: userId,
        }
    )) as {
        active_usage_event_count: number;
    };
}

async function getUserStreamControlCountByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string
) {
    return (await (ctx as any).runQuery(
        (components.sapopinguino.streamControl as Record<string, unknown>)
            .getUserStreamControlCount,
        {
            userId,
        }
    )) as {
        stream_control_count: number;
    };
}

async function forceStopActiveUserUsageEventsByUserId(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string,
    nowMs: number
) {
    return (await (ctx as any).runMutation(
        (components.subscriptions.webhook as Record<string, unknown>).forceStopUserActiveUsageEvents,
        {
            user_id: userId,
            now_ms: nowMs,
        }
    )) as {
        forced_stop_count: number;
        active_usage_event_count: number;
    };
}

function sleep(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assertPreservedQuotaPeriodForActiveDeletion(args: {
    has_active_subscription: boolean;
    preserved_quota_period_id?: string;
}) {
    if (
        args.has_active_subscription &&
        typeof args.preserved_quota_period_id !== "string"
    ) {
        throw new Error("Missing current quota period for active subscription deletion");
    }
}

async function resolveUserDeletionContextForFinalization(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string
): Promise<
    | {
          status: "ready";
          context: UserDeletionContext;
      }
    | {
          status: "already_finalized";
      }
> {
    const preparedDeletionContext = await getPreparedUserDeletionContextByUserId(ctx, userId);

    if (preparedDeletionContext) {
        return {
            status: "ready",
            context: preparedDeletionContext,
        };
    }

    const cleanupStatus = await getUserDeletionCleanupStatusByUserId(ctx, userId);
    const finalizationDecision = resolveUserDeletionFinalizationDecision({
        preparedDeletionContext,
        cleanupStatus,
    });

    if (finalizationDecision.status === "already_finalized") {
        return {
            status: "already_finalized",
        };
    }

    throw new Error(
        "Missing saved deletion preparation for unfinished account deletion; refusing to recalculate preserved quota period"
    );
}

async function waitForUserDeletionQuiescence(
    ctx: SubscriptionStateReconciliationCtx,
    userId: string
) {
    const stopRequests = await ctx.runMutation(
        components.sapopinguino.streamControl.requestUserStreamStops,
        {
            userId,
            nowMs: Date.now(),
        }
    );

    const getQuiescenceSnapshot = async () => {
        const [usageEventCountResult, streamControlCountResult] = await Promise.all([
            getActiveUserDeletionUsageEventCountByUserId(ctx, userId),
            getUserStreamControlCountByUserId(ctx, userId),
        ]);

        return {
            active_usage_event_count: usageEventCountResult.active_usage_event_count,
            stream_control_count: streamControlCountResult.stream_control_count,
        };
    };

    const waitUntil = async (deadlineMs: number) => {
        let snapshot = await getQuiescenceSnapshot();

        while (
            (snapshot.active_usage_event_count > 0 || snapshot.stream_control_count > 0) &&
            Date.now() < deadlineMs
        ) {
            await sleep(USER_DELETION_QUIESCENCE_POLL_INTERVAL_MS);
            snapshot = await getQuiescenceSnapshot();
        }

        return snapshot;
    };

    const initialSnapshot = await getQuiescenceSnapshot();
    const initialWaitDeadlineMs = Date.now() + USER_DELETION_QUIESCENCE_WAIT_TIMEOUT_MS;
    let snapshot = await waitUntil(initialWaitDeadlineMs);
    let forcedStopResult:
        | {
              forced_stop_count: number;
              active_usage_event_count: number;
          }
        | null = null;

    if (snapshot.active_usage_event_count > 0) {
        forcedStopResult = await forceStopActiveUserUsageEventsByUserId(ctx, userId, Date.now());
        snapshot = await waitUntil(Date.now() + USER_DELETION_FORCE_STOP_SETTLE_TIMEOUT_MS);
    }

    if (snapshot.active_usage_event_count > 0 || snapshot.stream_control_count > 0) {
        throw new Error(
            "Timed out waiting for active usage events and stream controls to stop during account deletion"
        );
    }

    return {
        stop_requests: stopRequests,
        initial_active_usage_event_count: initialSnapshot.active_usage_event_count,
        initial_stream_control_count: initialSnapshot.stream_control_count,
        final_active_usage_event_count: snapshot.active_usage_event_count,
        final_stream_control_count: snapshot.stream_control_count,
        forced_stop_result: forcedStopResult,
    };
}

function getRevenueCatEventsRetentionCutoffMs(nowMs: number) {
    const retentionCutoffDate = new Date(nowMs);
    retentionCutoffDate.setUTCMonth(
        retentionCutoffDate.getUTCMonth() - REVENUECAT_EVENTS_RETENTION_MONTHS
    );
    return retentionCutoffDate.getTime();
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

function parseBoolean(value: unknown): boolean | null {
    if (typeof value === "boolean") {
        return value;
    }

    if (typeof value === "string") {
        const normalizedValue = value.trim().toLowerCase();
        if (normalizedValue === "true") {
            return true;
        }
        if (normalizedValue === "false") {
            return false;
        }
    }

    return null;
}

function parseIdentifierString(value: unknown) {
    const parsedString = parseString(value);

    if (parsedString) {
        return parsedString;
    }

    const parsedNumber = parseNumber(value);
    return parsedNumber === null ? null : String(parsedNumber);
}

function resolveEnvironment(value: unknown) {
    const isSandbox = parseBoolean(value);

    if (isSandbox === null) {
        return undefined;
    }

    return isSandbox ? "sandbox" : "production";
}

function resolveEffectiveExpirationAtMs(
    expiresDateValue: unknown,
    gracePeriodExpiresDateValue: unknown
) {
    const expiresAtMs = parseTimestampMs(expiresDateValue);
    const gracePeriodExpiresAtMs = parseTimestampMs(gracePeriodExpiresDateValue);

    if (expiresAtMs === null) {
        return gracePeriodExpiresAtMs;
    }

    if (gracePeriodExpiresAtMs === null) {
        return expiresAtMs;
    }

    return Math.max(expiresAtMs, gracePeriodExpiresAtMs);
}

function shouldUseExistingSubscriptionState(
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

function parseObjectEntries(value: unknown): [string, Record<string, unknown>][] {
    if (!isRecord(value)) {
        return [];
    }

    const entries: [string, Record<string, unknown>][] = [];

    for (const [key, item] of Object.entries(value)) {
        if (isRecord(item)) {
            entries.push([key, item]);
        }
    }

    return entries;
}

function parseRevenueCatEntitlements(subscriberEntitlements: unknown): ParsedRevenueCatEntitlement[] {
    const parsedEntitlements: ParsedRevenueCatEntitlement[] = [];

    for (const [entitlementId, entitlement] of parseObjectEntries(subscriberEntitlements)) {
        parsedEntitlements.push({
            entitlement_id: entitlementId,
            product_id: parseString(entitlement.product_identifier) ?? undefined,
            purchase_at_ms: parseTimestampMs(entitlement.purchase_date) ?? undefined,
            expiration_at_ms: resolveEffectiveExpirationAtMs(
                entitlement.expires_date,
                entitlement.grace_period_expires_date
            ) ?? undefined,
        });
    }

    return parsedEntitlements;
}

function getEntitlementIdsByProductId(parsedEntitlements: ParsedRevenueCatEntitlement[]) {
    const entitlementIdsByProductId = new Map<string, string[]>();

    for (const entitlement of parsedEntitlements) {
        if (!entitlement.product_id) {
            continue;
        }

        const existingEntitlementIds = entitlementIdsByProductId.get(entitlement.product_id) ?? [];
        existingEntitlementIds.push(entitlement.entitlement_id);
        entitlementIdsByProductId.set(entitlement.product_id, existingEntitlementIds);
    }

    return entitlementIdsByProductId;
}

function parseRevenueCatSubscriptions(
    subscriberSubscriptions: unknown,
    entitlementIdsByProductId: Map<string, string[]>
): ParsedRevenueCatSubscription[] {
    const parsedSubscriptions: ParsedRevenueCatSubscription[] = [];

    for (const [productIdKey, subscription] of parseObjectEntries(subscriberSubscriptions)) {
        const productId = parseString(subscription.product_identifier) ?? productIdKey;

        parsedSubscriptions.push({
            product_id: productId,
            purchase_at_ms: parseTimestampMs(subscription.purchase_date) ?? undefined,
            expiration_at_ms: resolveEffectiveExpirationAtMs(
                subscription.expires_date,
                subscription.grace_period_expires_date
            ) ?? undefined,
            store_subscription_id: parseIdentifierString(subscription.store_transaction_id) ?? undefined,
            store: parseString(subscription.store) ?? undefined,
            environment: resolveEnvironment(subscription.is_sandbox),
            entitlement_ids: entitlementIdsByProductId.get(productId)?.slice() ?? [],
        });
    }

    return parsedSubscriptions;
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
            typeof subscription.expiration_at_ms !== "number"
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

function formatErrorMessage(error: unknown): string {
    if (typeof error === "object" && error && "message" in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === "string" && message.trim().length > 0) {
            return message.slice(0, 400);
        }
    }

    return "Unknown error";
}

async function fetchRevenueCatSubscriberSnapshot(
    appUserId: string,
    currentTimeMs: number
): Promise<RevenueCatReconciliationSnapshot> {
    const revenueCatSecretApiKey = getRevenueCatReadApiKey();

    if (!revenueCatSecretApiKey) {
        throw new Error("Missing REVENUECAT_SUBSCRIPTIONS_READ_API_KEY");
    }

    const encodedAppUserId = encodeURIComponent(appUserId);

    const response = await fetch(
        `${REVENUECAT_API_BASE_URL}/subscribers/${encodedAppUserId}`,
        {
            method: "GET",
            headers: {
                Authorization: `Bearer ${revenueCatSecretApiKey}`,
                Accept: "application/json",
            },
        }
    );

    if (!response.ok) {
        throw new Error(`RevenueCat API request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    if (!isRecord(payload)) {
        return {
            has_active_subscription: false,
        };
    }

    const subscriber = isRecord(payload.subscriber) ? payload.subscriber : null;
    if (!subscriber) {
        return {
            has_active_subscription: false,
        };
    }

    const evaluationTimeMs =
        parseTimestampMs(payload.request_date_ms) ??
        parseTimestampMs(payload.request_date) ??
        currentTimeMs;
    const parsedEntitlements = parseRevenueCatEntitlements(subscriber.entitlements);
    const parsedSubscriptions = parseRevenueCatSubscriptions(
        subscriber.subscriptions,
        getEntitlementIdsByProductId(parsedEntitlements)
    );
    const candidates = buildRevenueCatReconciliationCandidates(
        parsedEntitlements,
        parsedSubscriptions,
        evaluationTimeMs
    );

    const configuredEntitlementId = getPolyglotEntitlementId();
    const configuredProductIds = getPolyglotProductIds();

    const matchingCandidates = candidates.filter((candidate) => {
        const matchesEntitlement =
            configuredEntitlementId.length > 0 &&
            candidate.entitlement_ids.includes(configuredEntitlementId);
        const matchesProduct =
            typeof candidate.product_id === "string" &&
            configuredProductIds.includes(candidate.product_id);
        const hasNoFilters =
            configuredEntitlementId.length === 0 && configuredProductIds.length === 0;

        return matchesEntitlement || matchesProduct || hasNoFilters;
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

async function deleteRevenueCatSubscriber(appUserId: string) {
    const revenueCatSecretApiKey = getRevenueCatDeleteApiKey();

    if (!revenueCatSecretApiKey) {
        throw new Error(
            "Missing REVENUECAT_SUBSCRIPTIONS_DELETE_API_KEY or REVENUECAT_SUBSCRIPTIONS_READ_API_KEY"
        );
    }

    const encodedAppUserId = encodeURIComponent(appUserId);
    const response = await fetch(`${REVENUECAT_API_BASE_URL}/subscribers/${encodedAppUserId}`, {
        method: "DELETE",
        headers: {
            Authorization: `Bearer ${revenueCatSecretApiKey}`,
            Accept: "application/json",
        },
    });

    if (!response.ok) {
        throw new Error(`RevenueCat subscriber delete failed with status ${response.status}`);
    }

    return {
        deleted: true,
    };
}

async function reconcileSubscriptionStateFromRevenueCat(
    ctx: SubscriptionStateReconciliationCtx,
    args: {
        user_id: string;
        force: boolean;
        now_ms: number;
        store_subscription_id_hint?: string;
        allow_user_deletion_in_progress?: boolean;
    }
): Promise<SubscriptionStateRefreshResult> {
    const existingState = (await (ctx as any).runQuery(
        (components.subscriptions.webhook as Record<string, unknown>).getSubscriptionStateByUserId,
        {
            user_id: args.user_id,
        }
    )) as CurrentSubscriptionState | null;
    const revenueCatAppUserId = existingState?.revenuecat_app_user_id ?? args.user_id;
    let snapshotHasActiveSubscription = false;

    if (args.allow_user_deletion_in_progress !== true) {
        const deletionOperationState = await getUserDeletionOperationStateByUserId(ctx, args.user_id);

        if (deletionOperationState.in_progress) {
            return {
                status: "deletion_in_progress",
                revenuecat_app_user_id: revenueCatAppUserId,
            };
        }
    }

    if (!args.force && existingState && shouldUseExistingSubscriptionState(existingState, args.now_ms)) {
        return {
            status: "already_fresh",
            revenuecat_app_user_id: revenueCatAppUserId,
            plan_key: existingState.plan_key,
            has_active_subscription: existingState.has_active_subscription,
            last_synced_at_ms: existingState.last_synced_at_ms,
            ...(typeof existingState.billing_cycle_end_at_ms === "number"
                ? { billing_cycle_end_at_ms: existingState.billing_cycle_end_at_ms }
                : {}),
        };
    }

    try {
        const processingConfig = getSubscriptionProcessingConfig();
        const betterAuthUser = await getBetterAuthUserCreatedAtMs(ctx, args.user_id);

        if (!betterAuthUser.exists) {
            return {
                status: "user_missing",
                revenuecat_app_user_id: revenueCatAppUserId,
            };
        }

        const snapshot = await fetchRevenueCatSubscriberSnapshot(revenueCatAppUserId, args.now_ms);
        snapshotHasActiveSubscription = snapshot.has_active_subscription;
        const applyResult: {
            status: "created" | "updated" | "unchanged";
            plan_key: "free" | "polyglot";
            has_active_subscription: boolean;
            last_synced_at_ms: number;
            billing_cycle_end_at_ms?: number;
        } = await (ctx as any).runMutation(
            components.subscriptions.webhook.applyReconciledSubscriptionState,
            {
                user_id: args.user_id,
                revenuecat_app_user_id: revenueCatAppUserId,
                ...(typeof betterAuthUser.created_at_ms === "number"
                    ? { signup_at_ms: betterAuthUser.created_at_ms }
                    : {}),
                synced_at_ms: args.now_ms,
                expiration_reconciliation_delay_ms:
                    processingConfig.expiration_reconciliation_delay_ms,
                ...(args.store_subscription_id_hint
                    ? { store_subscription_id_hint: args.store_subscription_id_hint }
                    : {}),
                ...(args.allow_user_deletion_in_progress === true
                    ? { allow_user_deletion_in_progress: true }
                    : {}),
                snapshot,
            }
        );

        return {
            ...applyResult,
            revenuecat_app_user_id: revenueCatAppUserId,
        };
    } catch (error) {
        return {
            status: "refresh_failed",
            revenuecat_app_user_id: revenueCatAppUserId,
            error: formatErrorMessage(error),
            should_block_requests:
                existingState?.has_active_subscription === true || snapshotHasActiveSubscription,
            ...(existingState ? { plan_key: existingState.plan_key } : {}),
            ...(typeof existingState?.has_active_subscription === "boolean"
                ? { has_active_subscription: existingState.has_active_subscription }
                : {}),
            ...(typeof existingState?.last_synced_at_ms === "number"
                ? { last_synced_at_ms: existingState.last_synced_at_ms }
                : {}),
            ...(typeof existingState?.billing_cycle_end_at_ms === "number"
                ? { billing_cycle_end_at_ms: existingState.billing_cycle_end_at_ms }
                : {}),
        };
    }
}

async function processRevenueCatWebhookEventById(
    ctx: SubscriptionStateReconciliationCtx,
    args: {
        event_doc_id: string;
        now_ms: number;
    }
): Promise<{ status: "missing" | "processed" | "ignored" | "failed" | "dead_letter" }> {
    const eventDoc = (await ctx.runQuery(components.subscriptions.webhook.getRevenueCatEventForProcessing, {
        event_doc_id: args.event_doc_id,
    })) as RevenueCatWebhookEventForProcessing | null;

    if (!eventDoc) {
        return {
            status: "missing",
        };
    }

    if (
        eventDoc.status === "processed" ||
        eventDoc.status === "ignored" ||
        eventDoc.status === "dead_letter"
    ) {
        return {
            status: eventDoc.status,
        };
    }

    if (eventDoc.target_user_ids.length === 0) {
        const ignoredResult: {
            status: "missing" | "ignored" | "processed" | "dead_letter";
        } = await ctx.runMutation(components.subscriptions.webhook.markRevenueCatEventIgnored, {
            event_doc_id: args.event_doc_id,
            now_ms: args.now_ms,
            reason: "No non-anonymous app user id found in webhook payload",
            ...(eventDoc.user_id ? { user_id: eventDoc.user_id } : {}),
        });

        return {
            status: ignoredResult.status === "missing" ? "missing" : "ignored",
        };
    }

    const reconciliationResults = await Promise.all(
        eventDoc.target_user_ids.map((userId) =>
            reconcileSubscriptionStateFromRevenueCat(ctx, {
                user_id: userId,
                force: true,
                now_ms: args.now_ms,
                store_subscription_id_hint:
                    resolveStoreSubscriptionIdHintFromRevenueCatEvent(eventDoc),
            })
        )
    );

    const refreshFailures = reconciliationResults.filter(
        (result): result is Extract<SubscriptionStateRefreshResult, { status: "refresh_failed" }> =>
            result.status === "refresh_failed"
    );
    const deletionBlocks = reconciliationResults.filter(
        (result): result is Extract<SubscriptionStateRefreshResult, { status: "deletion_in_progress" }> =>
            result.status === "deletion_in_progress"
    );

    const successfulRefreshes = reconciliationResults.filter(
        (
            result
        ): result is Exclude<
            SubscriptionStateRefreshResult,
            { status: "refresh_failed" } | { status: "deletion_in_progress" }
        > => result.status !== "refresh_failed" && result.status !== "deletion_in_progress"
    );

    if (refreshFailures.length > 0) {
        const failureResult: {
            status: "missing" | "failed" | "processed" | "ignored" | "dead_letter";
        } = await ctx.runMutation(components.subscriptions.webhook.markRevenueCatEventProcessingFailure, {
            event_doc_id: args.event_doc_id,
            now_ms: args.now_ms,
            error_message: refreshFailures
                .map((failure) => `${failure.revenuecat_app_user_id}: ${failure.error}`)
                .join(" | "),
            retry_config: getWebhookRetryConfig(),
        });

        return {
            status: failureResult.status === "dead_letter" ? "dead_letter" : "failed",
        };
    }

    if (deletionBlocks.length > 0) {
        const failureResult: {
            status: "missing" | "failed" | "processed" | "ignored" | "dead_letter";
        } = await ctx.runMutation(components.subscriptions.webhook.markRevenueCatEventProcessingFailure, {
            event_doc_id: args.event_doc_id,
            now_ms: args.now_ms,
            error_message: deletionBlocks
                .map((block) => `${block.revenuecat_app_user_id}: user deletion in progress`)
                .join(" | "),
            retry_config: getWebhookRetryConfig(),
        });

        return {
            status: failureResult.status === "dead_letter" ? "dead_letter" : "failed",
        };
    }

    if (successfulRefreshes.length === 0) {
        const ignoredResult: {
            status: "missing" | "ignored" | "processed" | "dead_letter";
        } = await ctx.runMutation(components.subscriptions.webhook.markRevenueCatEventIgnored, {
            event_doc_id: args.event_doc_id,
            now_ms: args.now_ms,
            reason: "No matching Better Auth user found for webhook payload",
            ...(eventDoc.user_id ? { user_id: eventDoc.user_id } : {}),
        });

        return {
            status: ignoredResult.status === "missing" ? "missing" : "ignored",
        };
    }

    await ctx.runMutation(components.subscriptions.webhook.markRevenueCatEventProcessed, {
        event_doc_id: args.event_doc_id,
        now_ms: args.now_ms,
        user_id: eventDoc.user_id ?? eventDoc.target_user_ids[0],
    });

    return {
        status: "processed",
    };
}

export const refreshSubscriptionStateFromRevenueCat = internalAction({
    args: {
        user_id: v.string(),
        force: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        return reconcileSubscriptionStateFromRevenueCat(ctx, {
            user_id: args.user_id,
            force: args.force === true,
            now_ms: Date.now(),
        });
    },
});

export const prepareUserAccountDeletion = internalAction({
    args: {
        user_id: v.string(),
    },
    handler: async (ctx, args) => {
        const nowMs = Date.now();
        await startUserDeletionOperationByUserId(ctx, args.user_id, nowMs);

        try {
            const refreshResult = await reconcileSubscriptionStateFromRevenueCat(ctx, {
                user_id: args.user_id,
                force: true,
                now_ms: nowMs,
                allow_user_deletion_in_progress: true,
            });

            if (refreshResult.status === "refresh_failed") {
                throw new Error(refreshResult.error);
            }

            if (refreshResult.status === "user_missing") {
                throw new Error("Unable to delete account data for a missing Better Auth user");
            }

            if (refreshResult.status === "deletion_in_progress") {
                throw new Error("Unable to refresh subscription state while account deletion is active");
            }

            const deletionSnapshot = await getUserDeletionSnapshotByUserId(ctx, args.user_id);
            const preservedQuotaPeriodId = deletionSnapshot.current_quota_period_id;

            assertPreservedQuotaPeriodForActiveDeletion({
                has_active_subscription: deletionSnapshot.has_active_subscription,
                preserved_quota_period_id: preservedQuotaPeriodId,
            });

            await (ctx as any).runMutation(
                (components.subscriptions.webhook as Record<string, unknown>)
                    .upsertUserDeletionPreparation,
                {
                    user_id: args.user_id,
                    revenuecat_app_user_id: deletionSnapshot.revenuecat_app_user_id,
                    has_active_subscription: deletionSnapshot.has_active_subscription,
                    ...(preservedQuotaPeriodId
                        ? { preserved_quota_period_id: preservedQuotaPeriodId }
                        : {}),
                    ...(deletionSnapshot.store_subscription_id
                        ? { store_subscription_id: deletionSnapshot.store_subscription_id }
                        : {}),
                    ...(deletionSnapshot.store_subscription_period_id
                        ? {
                              store_subscription_period_id:
                                  deletionSnapshot.store_subscription_period_id,
                          }
                        : {}),
                    prepared_at_ms: nowMs,
                }
            );

            const revenueCatDeleteResult = await deleteRevenueCatSubscriber(
                refreshResult.revenuecat_app_user_id
            );

            return {
                refresh: refreshResult,
                deletion_snapshot: deletionSnapshot,
                revenuecat_delete: revenueCatDeleteResult,
            };
        } catch (error) {
            await Promise.allSettled([
                clearUserDeletionPreparationByUserId(ctx, args.user_id),
                clearUserDeletionOperationByUserId(ctx, args.user_id),
            ]);
            throw error;
        }
    },
});

export const finalizeDeletedUserData = internalAction({
    args: {
        user_id: v.string(),
    },
    handler: async (ctx, args) => {
        const deletionContextResult = await resolveUserDeletionContextForFinalization(
            ctx,
            args.user_id
        );

        if (deletionContextResult.status === "already_finalized") {
            await clearUserDeletionOperationByUserId(ctx, args.user_id).catch(() => null);
            return {
                status: "already_finalized" as const,
            };
        }

        const deletionContext = deletionContextResult.context;

        assertPreservedQuotaPeriodForActiveDeletion({
            has_active_subscription: deletionContext.has_active_subscription,
            preserved_quota_period_id: deletionContext.preserved_quota_period_id,
        });

        const preservedQuotaPeriodId = deletionContext.has_active_subscription
            ? deletionContext.preserved_quota_period_id
            : undefined;
        const quiescenceResult = await waitForUserDeletionQuiescence(ctx, args.user_id);
        let subscriptionCleanupResult: {
            preserved_quota_period_id: string | null;
            deleted_quota_periods: number;
            deleted_usage_events: number;
            deleted_revenue_cat_events: number;
            has_remaining: boolean;
        };
        let deletedQuotaPeriods = 0;
        let deletedUsageEvents = 0;
        let deletedRevenueCatEvents = 0;

        do {
            subscriptionCleanupResult = await ctx.runMutation(
                components.subscriptions.webhook.deleteUserSubscriptionData,
                {
                    user_id: args.user_id,
                    revenuecat_app_user_id: deletionContext.revenuecat_app_user_id,
                    ...(preservedQuotaPeriodId
                        ? { preserved_quota_period_id: preservedQuotaPeriodId }
                        : {}),
                    now_ms: Date.now(),
                }
            ) as typeof subscriptionCleanupResult;

            deletedQuotaPeriods += subscriptionCleanupResult.deleted_quota_periods;
            deletedUsageEvents += subscriptionCleanupResult.deleted_usage_events;
            deletedRevenueCatEvents += subscriptionCleanupResult.deleted_revenue_cat_events;
        } while (subscriptionCleanupResult.has_remaining);

        const streamControlCleanupResult = await ctx.runMutation(
            components.sapopinguino.streamControl.deleteUserStreamControls,
            {
                userId: args.user_id,
            }
        );
        const finalizationResult = await ctx.runMutation(
            components.subscriptions.webhook.finalizeDeletedUserSubscriptionData,
            {
                user_id: args.user_id,
                revenuecat_app_user_id: deletionContext.revenuecat_app_user_id,
                ...(preservedQuotaPeriodId
                    ? { preserved_quota_period_id: preservedQuotaPeriodId }
                    : {}),
                has_active_subscription: deletionContext.has_active_subscription,
                ...(deletionContext.store_subscription_id
                    ? { store_subscription_id: deletionContext.store_subscription_id }
                    : {}),
                ...(deletionContext.store_subscription_period_id
                    ? {
                          store_subscription_period_id:
                              deletionContext.store_subscription_period_id,
                      }
                    : {}),
                now_ms: Date.now(),
            }
        );
        const deletionOperationCleanupResult = await clearUserDeletionOperationByUserId(
            ctx,
            args.user_id
        ).catch((error) => ({
            deleted_count: 0,
            error: formatErrorMessage(error),
        }));

        return {
            quiescence: quiescenceResult,
            subscription_cleanup: {
                ...subscriptionCleanupResult,
                deleted_quota_periods: deletedQuotaPeriods,
                deleted_usage_events: deletedUsageEvents,
                deleted_revenue_cat_events: deletedRevenueCatEvents,
            },
            stream_control_cleanup: streamControlCleanupResult,
            finalization: finalizationResult,
            deletion_operation_cleanup: deletionOperationCleanupResult,
        };
    },
});

export const reconcileUsageEventQuotaApplication = internalAction({
    args: {
        // Component document IDs become opaque strings at the app boundary.
        usage_event_id: v.string(),
    },
    handler: async (ctx, args) => {
        return ctx.runMutation(
            components.subscriptions.webhook.applyUsageEventChargeToQuotaPeriod,
            {
                usage_event_id: args.usage_event_id,
                now_ms: Date.now(),
            }
        );
    },
});

export const processRevenueCatWebhookEvent = internalAction({
    args: {
        // Validate this inside the subscriptions component, not against the app schema.
        event_doc_id: v.string(),
    },
    handler: async (ctx, args) => {
        const nowMs = Date.now();

        try {
            return await processRevenueCatWebhookEventById(ctx, {
                event_doc_id: args.event_doc_id,
                now_ms: nowMs,
            });
        } catch (error) {
            await ctx
                .runMutation(components.subscriptions.webhook.markRevenueCatEventProcessingFailure, {
                    event_doc_id: args.event_doc_id,
                    now_ms: nowMs,
                    error_message: formatErrorMessage(error),
                    retry_config: getWebhookRetryConfig(),
                })
                .catch(() => {
                    return null;
                });

            return {
                status: "failed" as const,
            };
        }
    },
});

export const retryRevenueCatWebhookEvents = internalAction({
    args: {},
    handler: async (ctx) => {
        const startedAtMs = Date.now();
        const batchLimit = getRetryBatchLimit();
        const halfLimit = Math.max(1, Math.floor(batchLimit / 2));

        const [pendingEventIds, failedEventIds] = await Promise.all([
            ctx.runQuery(components.subscriptions.webhook.listRetryableRevenueCatEvents, {
                status: "pending",
                now_ms: startedAtMs,
                limit: halfLimit,
            }),
            ctx.runQuery(components.subscriptions.webhook.listRetryableRevenueCatEvents, {
                status: "failed",
                now_ms: startedAtMs,
                limit: batchLimit,
            }),
        ]);

        const eventIds = Array.from(new Set([...pendingEventIds, ...failedEventIds])).slice(
            0,
            batchLimit
        );

        let processedCount = 0;
        let failedCount = 0;

        for (const eventId of eventIds) {
            let processingResult: {
                status: "missing" | "processed" | "ignored" | "failed" | "dead_letter";
            };

            try {
                processingResult = await processRevenueCatWebhookEventById(ctx, {
                    event_doc_id: eventId,
                    now_ms: Date.now(),
                });
            } catch (error) {
                processingResult = {
                    status: "failed",
                };

                await ctx.runMutation(components.subscriptions.webhook.markRevenueCatEventProcessingFailure, {
                    event_doc_id: eventId,
                    now_ms: Date.now(),
                    error_message: formatErrorMessage(error),
                    retry_config: getWebhookRetryConfig(),
                });
            }

            if (processingResult.status === "failed" || processingResult.status === "dead_letter") {
                failedCount += 1;
                continue;
            }

            if (processingResult.status !== "missing") {
                processedCount += 1;
            }
        }

        return {
            scanned: eventIds.length,
            processed: processedCount,
            failed: failedCount,
            started_at_ms: startedAtMs,
        };
    },
});

export const reconcileExpiredSubscriptionStates = internalAction({
    args: {},
    handler: async (ctx): Promise<
        | { processed: number; failed: number; scanned: number }
        | { processed: number; failed: number; skipped: string }
    > => {
        const apiKey = getRevenueCatReadApiKey();
        if (!apiKey) {
            return {
                processed: 0,
                failed: 0,
                skipped: "Missing REVENUECAT_SUBSCRIPTIONS_READ_API_KEY",
            };
        }

        const startedAtMs = Date.now();
        const dueStates = await (ctx as any).runQuery(
            (components.subscriptions.webhook as Record<string, unknown>)
                .listSubscriptionStatesDueForExpirationReconciliation,
            {
                now_ms: startedAtMs,
                limit: getReconciliationBatchLimit(),
            }
        ) as {
            user_id: string;
            revenuecat_app_user_id?: string;
        }[];

        let processed = 0;
        let failed = 0;

        for (const dueState of dueStates) {
            const refreshResult = await reconcileSubscriptionStateFromRevenueCat(ctx, {
                user_id: dueState.user_id,
                force: true,
                now_ms: Date.now(),
            });

            if (
                refreshResult.status !== "refresh_failed" &&
                refreshResult.status !== "deletion_in_progress"
            ) {
                processed += 1;
                continue;
            }

            failed += 1;

            await ctx.runMutation(components.subscriptions.webhook.deferSubscriptionStateReconciliation, {
                user_id: dueState.user_id,
                next_attempt_at_ms: Date.now() + getReconciliationFailureBackoffMs(),
            });
        }

        return {
            processed,
            failed,
            scanned: dueStates.length,
        };
    },
});

export const ensureSubscriptionPlanLimits = internalAction({
    args: {},
    handler: async (ctx) => {
        await ctx.runMutation(components.subscriptions.webhook.upsertSubscriptionPlanLimits, {
            plans: DEFAULT_PLAN_LIMITS,
            now_ms: Date.now(),
        });

        return {
            status: "ok",
            plans: DEFAULT_PLAN_LIMITS.length,
        };
    },
});

export const purgeExpiredRevenueCatEvents = internalAction({
    args: {},
    handler: async (ctx) => {
        const nowMs = Date.now();
        const olderThanMs = getRevenueCatEventsRetentionCutoffMs(nowMs);
        const statusesToPurge: ("processed" | "ignored" | "dead_letter")[] = [
            "processed",
            "ignored",
            "dead_letter",
        ];

        let deletedCount = 0;

        for (const status of statusesToPurge) {
            const eventDocIds = await ctx.runQuery(
                components.subscriptions.webhook.listRevenueCatEventsEligibleForRetentionPurge,
                {
                    status,
                    older_than_ms: olderThanMs,
                    limit: RETENTION_PURGE_BATCH_LIMIT_PER_STATUS,
                }
            );

            if (eventDocIds.length === 0) {
                continue;
            }

            const deletionResult = await ctx.runMutation(
                components.subscriptions.webhook.purgeRevenueCatEventsById,
                {
                    event_doc_ids: eventDocIds,
                }
            );

            deletedCount += deletionResult.deleted_count;
        }

        return {
            retention_months: REVENUECAT_EVENTS_RETENTION_MONTHS,
            older_than_ms: olderThanMs,
            deleted_count: deletedCount,
        };
    },
});

export const checkRevenueCatPipelineHealth = internalAction({
    args: {},
    handler: async (ctx) => {
        const [deadLetterEvents, failedEvents] = await Promise.all([
            ctx.runQuery(components.subscriptions.webhook.listRevenueCatEventsForStatus, {
                status: "dead_letter",
                limit: 25,
            }),
            ctx.runQuery(components.subscriptions.webhook.listRevenueCatEventsForStatus, {
                status: "failed",
                limit: 25,
            }),
        ]);

        if (deadLetterEvents.length > 0) {
            console.warn(
                JSON.stringify({
                    event: "revenuecat_dead_letter_detected",
                    dead_letter_count: deadLetterEvents.length,
                    sample_event_ids: deadLetterEvents
                        .slice(0, 5)
                        .map((item: { event_id: string }) => item.event_id),
                })
            );
        }

        if (failedEvents.length > 0) {
            console.warn(
                JSON.stringify({
                    event: "revenuecat_failed_events_detected",
                    failed_count: failedEvents.length,
                    sample_event_ids: failedEvents
                        .slice(0, 5)
                        .map((item: { event_id: string }) => item.event_id),
                })
            );
        }

        return {
            checked_at_ms: Date.now(),
            dead_letter_count: deadLetterEvents.length,
            failed_count: failedEvents.length,
        };
    },
});

export const getRevenueCatPipelineHealthSnapshot = internalQuery({
    args: {
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = Math.max(1, Math.min(args.limit ?? 25, 100));

        const [deadLetterEvents, failedEvents, pendingEvents] = await Promise.all([
            ctx.runQuery(components.subscriptions.webhook.listRevenueCatEventsForStatus, {
                status: "dead_letter",
                limit,
            }),
            ctx.runQuery(components.subscriptions.webhook.listRevenueCatEventsForStatus, {
                status: "failed",
                limit,
            }),
            ctx.runQuery(components.subscriptions.webhook.listRevenueCatEventsForStatus, {
                status: "pending",
                limit,
            }),
        ]);

        return {
            sampled_at_ms: Date.now(),
            dead_letter_events: deadLetterEvents,
            failed_events: failedEvents,
            pending_events: pendingEvents,
        };
    },
});
