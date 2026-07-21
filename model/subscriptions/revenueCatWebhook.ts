import { components, internal } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import { isAllowedCorsRequest } from "../http/cors";
import { readBoundedJsonRequestBody } from "../http/requestBody";
import { POST_OPTIONS_METHODS } from "../../constants/http";

import {
    buildRevenueCatWebhookEventForIngestion,
    resolveRevenueCatWebhookTargetUserIds,
    shouldPersistRevenueCatWebhookRawPayload,
    shouldSkipRevenueCatWebhookIngestion,
} from "./revenueCatWebhookIngestion";
import {
    normalizeRevenueCatWebhookEvent,
    safeJsonStringify,
    type NormalizedRevenueCatWebhookEvent,
} from "./revenueCatWebhookPayload";
import {
    formatErrorMessage,
    getRevenueCatWebhookResponseHeaders,
    isAuthorizedRevenueCatWebhookRequest,
    jsonRevenueCatWebhookResponse,
} from "./revenueCatWebhookHttp";
import type { UserDeletionQueueStatus } from "./userDeletionQueue";

const MAX_REVENUECAT_WEBHOOK_REQUEST_BODY_BYTES = 256 * 1024;

async function resolveEligibleRevenueCatWebhookUserIds(
    ctx: ActionCtx,
    normalizedEvent: NormalizedRevenueCatWebhookEvent
) {
    const candidateUserIds = resolveRevenueCatWebhookTargetUserIds(normalizedEvent);

    if (candidateUserIds.length === 0) {
        return {
            candidate_user_ids: candidateUserIds,
            eligible_user_ids: [] as string[],
        };
    }

    const eligibleUserIds = (
        await Promise.all(
            candidateUserIds.map(async (userId) => {
                const [user, deletionState] = await Promise.all([
                    (ctx as any).runQuery(components.betterAuth.adapter.findOne, {
                        model: "user",
                        where: [{ field: "_id", value: userId }],
                    }) as Promise<{ _id: string } | null>,
                    (ctx as any).runQuery(
                        (components.subscriptions.webhook as Record<string, unknown>)
                            .getUserDeletionOperationState,
                        {
                            user_id: userId,
                        }
                    ) as Promise<{
                        in_progress: boolean;
                        status?: UserDeletionQueueStatus;
                        blocks_processing?: boolean;
                        blocks_revenuecat_reconciliation?: boolean;
                    }>,
                ]);

                if (!user || deletionState.blocks_revenuecat_reconciliation === true) {
                    return null;
                }

                return userId;
            })
        )
    ).filter((userId): userId is string => typeof userId === "string");

    return {
        candidate_user_ids: candidateUserIds,
        eligible_user_ids: eligibleUserIds,
    };
}

export async function handleRevenueCatWebhookOptionsRequest(
    _ctx: ActionCtx,
    request: Request
) {
    if (!isAllowedCorsRequest(request)) {
        return new Response(null, {
            status: 403,
            headers: getRevenueCatWebhookResponseHeaders(request),
        });
    }

    return new Response(null, {
        status: 204,
        headers: getRevenueCatWebhookResponseHeaders(request),
    });
}

export async function handleRevenueCatWebhookRequest(ctx: ActionCtx, request: Request) {
    if (!isAllowedCorsRequest(request)) {
        return jsonRevenueCatWebhookResponse(request, 403, {
            ok: false,
            error: "Forbidden origin",
        });
    }

    if (request.method !== "POST") {
        return jsonRevenueCatWebhookResponse(request, 405, {
            ok: false,
            error: "Method not allowed",
        }, {
            Allow: POST_OPTIONS_METHODS,
        });
    }

    if (!isAuthorizedRevenueCatWebhookRequest(request)) {
        return jsonRevenueCatWebhookResponse(request, 401, {
            ok: false,
            error: "Unauthorized webhook",
        });
    }

    let payload: unknown;
    const payloadResult = await readBoundedJsonRequestBody<unknown>(request, {
        maxBytes: MAX_REVENUECAT_WEBHOOK_REQUEST_BODY_BYTES,
    });

    if (!payloadResult.ok) {
        return jsonRevenueCatWebhookResponse(request, payloadResult.status, {
            ok: false,
            error:
                payloadResult.status === 413
                    ? "Request body too large"
                    : "Invalid JSON payload",
        });
    }

    payload = payloadResult.body;

    const receivedAtMs = Date.now();
    const normalizedEvent = normalizeRevenueCatWebhookEvent(payload, receivedAtMs);

    if (!normalizedEvent) {
        return jsonRevenueCatWebhookResponse(request, 400, {
            ok: false,
            error: "Invalid RevenueCat event payload",
        });
    }

    const eligibleUserIdsResult = await resolveEligibleRevenueCatWebhookUserIds(ctx, normalizedEvent);

    if (shouldSkipRevenueCatWebhookIngestion(eligibleUserIdsResult)) {
        console.info(
            JSON.stringify({
                event: "revenuecat_webhook_skipped_for_deleted_or_missing_users",
                event_id: normalizedEvent.event_id,
                candidate_user_ids: eligibleUserIdsResult.candidate_user_ids,
            })
        );

        return jsonRevenueCatWebhookResponse(request, 200, {
            ok: true,
            skipped: true,
        });
    }

    const eventForIngestion = buildRevenueCatWebhookEventForIngestion(
        normalizedEvent,
        eligibleUserIdsResult.eligible_user_ids
    );
    const rawPayload = shouldPersistRevenueCatWebhookRawPayload(eligibleUserIdsResult)
        ? safeJsonStringify(payload) ?? undefined
        : undefined;
    const ingestionArgs = {
        normalized_event: eventForIngestion,
        received_at_ms: receivedAtMs,
        ...(typeof rawPayload === "string" ? { raw_payload: rawPayload } : {}),
    };

    const ingestionEventDocId = (
        await ctx.runMutation(components.subscriptions.webhook.ingestRevenueCatEvent, ingestionArgs)
    ).event_doc_id;

    try {
        await ctx.scheduler.runAfter(0, internal.subscriptionsWorkers.processRevenueCatWebhookEvent, {
            event_doc_id: ingestionEventDocId,
        });
    } catch (error) {
        console.warn(
            JSON.stringify({
                event: "revenuecat_webhook_schedule_failed",
                event_id: normalizedEvent.event_id,
                error: formatErrorMessage(error),
            })
        );
    }

    return jsonRevenueCatWebhookResponse(request, 200, {
        ok: true,
    });
}
