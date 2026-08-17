import type { ActionCtx } from "../../_generated/server";
import { POST_OPTIONS_METHODS } from "../../constants/http";
import {
    SUBSCRIPTION_PLAN_KEYS,
    type SubscriptionPlanKey,
} from "../../constants/subscriptions";
import type { AuthenticatedHttpContext } from "../../lib/httpAuth";
import { reconcileObservedSubscriptionStateHandler } from "../subscriptions/workers";
import { buildCorsResponseHeaders, isAllowedCorsRequest } from "./cors";
import { isRecord, readBoundedJsonRequestBody } from "./requestBody";

const MAX_RECONCILIATION_REQUEST_BODY_BYTES = 2_048;

export function responseHeaders(request: Request) {
    return buildCorsResponseHeaders(request, {
        contentType: "application/json",
        cacheControl: "no-store",
        allowedMethods: POST_OPTIONS_METHODS,
    });
}

function jsonResponse(
    request: Request,
    status: number,
    payload: Record<string, unknown>,
    extraHeaders?: Record<string, string>
) {
    const headers = responseHeaders(request);

    for (const [header, value] of Object.entries(extraHeaders ?? {})) {
        headers.set(header, value);
    }

    return new Response(JSON.stringify(payload), { status, headers });
}

function publicSubscriptionState(result: {
    has_active_subscription?: boolean;
    plan_key?: SubscriptionPlanKey;
}) {
    return {
        has_active_subscription: result.has_active_subscription === true,
        plan_key: result.plan_key ?? SUBSCRIPTION_PLAN_KEYS.FREE,
    };
}

export async function handleSubscriptionReconciliationOptionsRequest(
    _ctx: ActionCtx,
    request: Request
) {
    if (!isAllowedCorsRequest(request)) {
        return new Response(null, { status: 403, headers: responseHeaders(request) });
    }

    return new Response(null, { status: 204, headers: responseHeaders(request) });
}

export async function handleSubscriptionReconciliationRequest(
    ctx: ActionCtx,
    request: Request,
    auth: AuthenticatedHttpContext
) {
    if (request.method !== "POST") {
        return jsonResponse(
            request,
            405,
            { ok: false, error: "Method not allowed" },
            { Allow: POST_OPTIONS_METHODS }
        );
    }

    const bodyResult = await readBoundedJsonRequestBody<unknown>(request, {
        maxBytes: MAX_RECONCILIATION_REQUEST_BODY_BYTES,
        emptyBody: {},
    });

    if (!bodyResult.ok || !isRecord(bodyResult.body)) {
        const status = bodyResult.ok ? 400 : bodyResult.status;
        return jsonResponse(request, status, {
            ok: false,
            error: status === 413 ? "Request body too large" : "Invalid JSON payload",
        });
    }

    const requestBody = bodyResult.body;
    if (
        typeof requestBody.expected_user_id !== "string" ||
        requestBody.expected_user_id !== auth.userId
    ) {
        return jsonResponse(request, 409, {
            ok: false,
            error: "Authenticated user does not match reconciliation target",
        });
    }

    if (typeof requestBody.observed_active !== "boolean") {
        return jsonResponse(request, 400, {
            ok: false,
            error: "observed_active must be a boolean",
        });
    }

    let result: Awaited<ReturnType<typeof reconcileObservedSubscriptionStateHandler>>;
    try {
        result = await reconcileObservedSubscriptionStateHandler(ctx, {
            user_id: auth.userId,
            observed_active: requestBody.observed_active,
        });
    } catch (error) {
        console.error("Subscription reconciliation failed", error);
        return jsonResponse(request, 503, {
            ok: false,
            error: "Unable to reconcile subscription state",
        });
    }

    if (result.status === "rate_limited") {
        const retryAfterMs = Math.max(0, result.retry_at_ms - Date.now());
        return jsonResponse(
            request,
            429,
            {
                ok: false,
                status: "rate_limited",
                error: "Too many subscription reconciliation requests",
                retry_after_ms: retryAfterMs,
            },
            { "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) }
        );
    }

    if (result.status === "refresh_failed") {
        console.error("Subscription reconciliation failed", result.error);
        return jsonResponse(request, 503, {
            ok: false,
            status: "unavailable",
            error: "Unable to reconcile subscription state",
        });
    }

    if (result.status === "deletion_in_progress" || result.status === "user_missing") {
        return jsonResponse(request, 409, {
            ok: false,
            error: "Subscription state cannot be reconciled for this account",
        });
    }

    if (result.status === "pending_active") {
        if (result.has_active_subscription) {
            return jsonResponse(request, 200, {
                ok: true,
                status: "active",
                subscription: publicSubscriptionState(result),
            });
        }

        return jsonResponse(request, 202, {
            ok: true,
            status: "activating",
            subscription: publicSubscriptionState(result),
            retry_at_ms: result.pending_active_expires_at_ms,
        });
    }

    if (result.status === "sync_in_progress") {
        if (result.has_active_subscription) {
            return jsonResponse(request, 200, {
                ok: true,
                status: "active",
                subscription: publicSubscriptionState(result),
            });
        }

        return jsonResponse(request, 202, {
            ok: true,
            status: "reconciling",
            subscription: publicSubscriptionState(result),
            retry_at_ms: result.retry_at_ms,
        });
    }

    return jsonResponse(request, 200, {
        ok: true,
        status: result.has_active_subscription ? "active" : "inactive",
        subscription: publicSubscriptionState(result),
    });
}
