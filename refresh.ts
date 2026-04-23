import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { authenticatedHttpAction } from "./httpAuth";

function responseHeaders() {
    return new Headers({
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": process.env.CLIENT_ORIGIN ?? "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        Vary: "Origin",
    });
}

function jsonResponse(status: number, payload: Record<string, unknown>) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: responseHeaders(),
    });
}

export const refreshOptions = httpAction(async () => {
    return new Response(null, {
        status: 204,
        headers: responseHeaders(),
    });
});

export const refresh = authenticatedHttpAction(async (ctx, request, auth) => {
    if (request.method !== "GET" && request.method !== "POST") {
        return jsonResponse(405, {
            ok: false,
            error: "Method not allowed",
        });
    }

    const refreshResult = await ctx.runAction(
        internal.subscriptionsWorkers.refreshSubscriptionStateFromRevenueCat,
        {
            user_id: auth.userId,
            force: true,
        }
    );

    if (refreshResult.status === "refresh_failed") {
        return jsonResponse(503, {
            ok: false,
            error: refreshResult.error,
            refresh: refreshResult,
        });
    }

    if (refreshResult.status === "deletion_in_progress") {
        return jsonResponse(409, {
            ok: false,
            error: "Account deletion is in progress",
            refresh: refreshResult,
        });
    }

    if (refreshResult.status === "user_missing") {
        return jsonResponse(409, {
            ok: false,
            error: "Authenticated user no longer exists",
            refresh: refreshResult,
        });
    }

    return jsonResponse(200, {
        ok: true,
        refresh: refreshResult,
    });
}, responseHeaders);
