import { components } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import type { AuthenticatedHttpContext } from "../../lib/httpAuth";
import { buildCorsResponseHeaders, isAllowedCorsRequest } from "./cors";
import { isRecord, readBoundedJsonRequestBody } from "./requestBody";
import { getRefreshRateLimitConfig } from "../subscriptions/config";
import { refreshSubscriptionStateFromRevenueCatHandler } from "../subscriptions/workers";
import { GET_POST_OPTIONS_METHODS } from "../../constants/http";
import {
    SUBSCRIPTION_PLAN_KEYS,
    type SubscriptionPlanKey,
} from "../../constants/subscriptions";

const MAX_REFRESH_REQUEST_BODY_BYTES = 2_048;

export function responseHeaders(request: Request) {
    return buildCorsResponseHeaders(request, {
        contentType: "application/json",
        cacheControl: "no-store",
        allowedMethods: GET_POST_OPTIONS_METHODS,
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

    return new Response(JSON.stringify(payload), {
        status,
        headers,
    });
}

function publicRefreshResult(refreshResult: {
    has_active_subscription: boolean;
    plan_key: SubscriptionPlanKey;
}) {
    return {
        has_active_subscription: refreshResult.has_active_subscription,
        plan_key: refreshResult.plan_key,
    };
}

function refreshFailureResponse(request: Request, status: number) {
    return jsonResponse(request, status, {
        ok: false,
        error: "Unable to refresh subscription state",
    });
}

function refreshRateLimitedResponse(
    request: Request,
    rateLimitResult: {
        retry_after_ms?: number;
        limited_kind?: string;
    }
) {
    const retryAfterMs = Math.max(0, Math.floor(rateLimitResult.retry_after_ms ?? 0));

    return jsonResponse(
        request,
        429,
        {
            ok: false,
            error: "Too many subscription refresh requests",
            retry_after_ms: retryAfterMs,
            limited_kind: rateLimitResult.limited_kind,
        },
        {
            "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
        }
    );
}

async function readRefreshRequestBody(request: Request) {
    if (request.method !== "POST") {
        return {
            ok: true as const,
            body: {} as Record<string, unknown>,
        };
    }

    const bodyResult = await readBoundedJsonRequestBody<unknown>(request, {
        maxBytes: MAX_REFRESH_REQUEST_BODY_BYTES,
        emptyBody: {},
    });

    if (!bodyResult.ok) {
        return bodyResult;
    }

    if (!isRecord(bodyResult.body)) {
        return {
            ok: false as const,
            status: 400 as const,
        };
    }

    return {
        ok: true as const,
        body: bodyResult.body,
    };
}

export async function handleRefreshOptionsRequest(_ctx: ActionCtx, request: Request) {
    if (!isAllowedCorsRequest(request)) {
        return new Response(null, {
            status: 403,
            headers: responseHeaders(request),
        });
    }

    return new Response(null, {
        status: 204,
        headers: responseHeaders(request),
    });
}

export async function handleRefreshRequest(
    ctx: ActionCtx,
    request: Request,
    auth: AuthenticatedHttpContext
) {
    if (request.method !== "GET" && request.method !== "POST") {
        return jsonResponse(request, 405, {
            ok: false,
            error: "Method not allowed",
        }, {
            Allow: GET_POST_OPTIONS_METHODS,
        });
    }

    let requestBody: Record<string, unknown>;
    let refreshResult: {
        status: string;
        has_active_subscription?: boolean;
        plan_key?: SubscriptionPlanKey;
        error?: string;
    };

    const requestBodyResult = await readRefreshRequestBody(request);
    if (!requestBodyResult.ok) {
        return jsonResponse(request, requestBodyResult.status, {
            ok: false,
            error:
                requestBodyResult.status === 413
                    ? "Request body too large"
                    : "Invalid JSON payload",
        });
    }

    requestBody = requestBodyResult.body;

    if (
        typeof requestBody.expected_user_id === "string" &&
        requestBody.expected_user_id !== auth.userId
    ) {
        return jsonResponse(request, 409, {
            ok: false,
            error: "Authenticated user does not match refresh target",
        });
    }

    const expectsActiveSubscription = requestBody.expects_active_subscription === true;
    const refreshRateLimitResult = await (ctx as any).runMutation(
        (components.subscriptions.webhook as Record<string, unknown>).consumeRefreshRateLimit,
        {
            user_id: auth.userId,
            expects_active_subscription: expectsActiveSubscription,
            now_ms: Date.now(),
            config: getRefreshRateLimitConfig(),
        }
    ) as {
        allowed: boolean;
        retry_after_ms?: number;
        limited_kind?: string;
    };

    if (!refreshRateLimitResult.allowed) {
        return refreshRateLimitedResponse(request, refreshRateLimitResult);
    }

    try {
        refreshResult = await refreshSubscriptionStateFromRevenueCatHandler(ctx, {
            user_id: auth.userId,
            force: true,
            ...(expectsActiveSubscription
                ? {
                      expects_active_subscription: true,
                      active_signal_at_ms: Date.now(),
                  }
                : {}),
        });
    } catch (error) {
        console.error("Subscription refresh failed", error);
        return refreshFailureResponse(request, 503);
    }

    if (refreshResult.status === "refresh_failed") {
        console.error("Subscription refresh failed", refreshResult.error);
        return refreshFailureResponse(request, 503);
    }

    if (refreshResult.status === "deletion_in_progress") {
        return refreshFailureResponse(request, 409);
    }

    if (refreshResult.status === "user_missing") {
        return refreshFailureResponse(request, 409);
    }

    if (refreshResult.status === "pending_active" || refreshResult.status === "sync_in_progress") {
        return refreshFailureResponse(request, 425);
    }

    return jsonResponse(request, 200, {
        ok: true,
        refresh: publicRefreshResult({
            has_active_subscription: refreshResult.has_active_subscription === true,
            plan_key: refreshResult.plan_key ?? SUBSCRIPTION_PLAN_KEYS.FREE,
        }),
    });
}
