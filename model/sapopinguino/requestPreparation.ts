import type { ActionCtx } from "../../_generated/server";
import { POST_OPTIONS_METHODS } from "../../constants/http";
import { SUBSCRIPTION_QUOTA_ERROR_CODES } from "../../constants/subscriptions";
import type { AuthenticatedHttpContext } from "../../lib/httpAuth";
import type { SubscriptionUsageOperation } from "../../constants/subscriptions";
import {
    isValidSapopinguinoStreamId,
    readSapopinguinoJsonRequestBody,
    sanitizeSapopinguinoInputPayload,
} from "./input";
import { reserveSapopinguinoQuota } from "./quota";
import { sapopinguinoQuotaErrorResponse } from "./quotaHttp";
import { reconcileSubscriptionStateForUsage } from "../subscriptions/workers";

type StreamRequestBody = {
    input?: string;
    streamId?: string;
};

type ResponseHeadersFactory = (
    request: Request,
    contentType?: string,
    extraHeaders?: Record<string, string>
) => Headers;

export async function prepareSapopinguinoRequest(
    ctx: ActionCtx,
    request: Request,
    auth: AuthenticatedHttpContext,
    args: {
        operation: SubscriptionUsageOperation;
        error_body: string;
        method_not_allowed_content_type: string;
        get_response_headers: ResponseHeadersFactory;
    }
) {
    const errorResponse = (
        status: number,
        extraHeaders?: Record<string, string>
    ) => new Response(args.error_body, {
        status,
        headers: args.get_response_headers(request, undefined, extraHeaders),
    });

    if (request.method !== "POST") {
        return {
            ok: false as const,
            response: new Response("Method not allowed", {
                status: 405,
                headers: args.get_response_headers(
                    request,
                    args.method_not_allowed_content_type,
                    { Allow: POST_OPTIONS_METHODS }
                ),
            }),
        };
    }

    const bodyResult = await readSapopinguinoJsonRequestBody<StreamRequestBody>(request);
    if (!bodyResult.ok) {
        return { ok: false as const, response: errorResponse(bodyResult.status) };
    }

    const body = bodyResult.body;
    if (typeof body.input !== "string" || body.input.length === 0) {
        return { ok: false as const, response: errorResponse(400) };
    }

    const sanitizedInput = sanitizeSapopinguinoInputPayload(body.input);
    if (
        !sanitizedInput ||
        typeof body.streamId !== "string" ||
        !isValidSapopinguinoStreamId(body.streamId)
    ) {
        return { ok: false as const, response: errorResponse(400) };
    }

    const refreshResult = await reconcileSubscriptionStateForUsage(ctx, {
        user_id: auth.userId,
    });

    if (refreshResult.status === "refresh_failed" && refreshResult.should_block_requests) {
        return { ok: false as const, response: errorResponse(503) };
    }

    if (refreshResult.status === "deletion_in_progress") {
        return {
            ok: false as const,
            response: sapopinguinoQuotaErrorResponse(
                request,
                409,
                SUBSCRIPTION_QUOTA_ERROR_CODES.USER_DELETION_IN_PROGRESS
            ),
        };
    }

    if (refreshResult.status === "user_missing") {
        return { ok: false as const, response: errorResponse(409) };
    }

    if (refreshResult.status === "sync_in_progress") {
        return {
            ok: false as const,
            response: errorResponse(503, { "Retry-After": "1" }),
        };
    }

    try {
        const quotaReservation = await reserveSapopinguinoQuota(ctx, {
            userId: auth.userId,
            operation: args.operation,
            input: sanitizedInput.userInput,
            streamId: body.streamId,
            signupAtMs: auth.user.createdAt,
        });

        if (quotaReservation.status === "blocked") {
            return {
                ok: false as const,
                response: sapopinguinoQuotaErrorResponse(
                    request,
                    quotaReservation.httpStatus,
                    quotaReservation.reason
                ),
            };
        }

        if (quotaReservation.status === "error") {
            return { ok: false as const, response: errorResponse(500) };
        }

        return {
            ok: true as const,
            input: sanitizedInput.payload,
            usage_event_id: quotaReservation.usageEventId,
        };
    } catch {
        return { ok: false as const, response: errorResponse(500) };
    }
}
