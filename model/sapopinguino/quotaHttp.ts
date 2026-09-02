import {
    KEEP_ALIVE_CONNECTION,
    POST_OPTIONS_METHODS,
    SAPOPINGUINO_STREAM_CACHE_CONTROL,
} from "../../constants/http";
import { SUBSCRIPTION_QUOTA_ERROR_CODES } from "../../constants/subscriptions";
import { buildCorsResponseHeaders } from "../http/cors";

function getQuotaErrorMessage(reason: string) {
    switch (reason) {
        case SUBSCRIPTION_QUOTA_ERROR_CODES.MONTHLY_LIMIT_EXCEEDED:
            return "Quota limit reached.";
        case SUBSCRIPTION_QUOTA_ERROR_CODES.INPUT_LIMIT_EXCEEDED:
            return "Input limit reached.";
        case SUBSCRIPTION_QUOTA_ERROR_CODES.SUBSCRIPTION_REQUIRED:
            return "An active subscription is required for respelling.";
        case SUBSCRIPTION_QUOTA_ERROR_CODES.USER_DELETION_IN_PROGRESS:
            return "Account deletion is in progress.";
        default:
            return "Unable to start this request.";
    }
}

export function sapopinguinoQuotaErrorResponse(
    request: Request,
    status: number,
    reason: string
) {
    return new Response(
        JSON.stringify({
            error: reason,
            message: getQuotaErrorMessage(reason),
        }),
        {
            status,
            headers: buildCorsResponseHeaders(request, {
                contentType: "application/json; charset=utf-8",
                cacheControl: SAPOPINGUINO_STREAM_CACHE_CONTROL,
                allowedMethods: POST_OPTIONS_METHODS,
                extraHeaders: { Connection: KEEP_ALIVE_CONNECTION },
            }),
        }
    );
}
