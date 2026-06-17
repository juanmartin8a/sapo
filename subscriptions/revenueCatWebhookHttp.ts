import { buildCorsResponseHeaders } from "../httpCors";
import { parseString } from "../subscriptionsConfig";

function normalizeBearerValue(value: string): string {
    return value.replace(/^Bearer\s+/i, "").trim();
}

export function formatErrorMessage(error: unknown): string {
    if (typeof error === "object" && error && "message" in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === "string" && message.trim().length > 0) {
            return message.slice(0, 400);
        }
    }

    return "Unknown error";
}

export function getRevenueCatWebhookResponseHeaders(request: Request) {
    return buildCorsResponseHeaders(request, {
        contentType: "application/json",
        allowedMethods: "POST, OPTIONS",
    });
}

export function jsonRevenueCatWebhookResponse(
    request: Request,
    status: number,
    payload: Record<string, unknown>,
    extraHeaders?: Record<string, string>
) {
    const headers = getRevenueCatWebhookResponseHeaders(request);

    for (const [header, value] of Object.entries(extraHeaders ?? {})) {
        headers.set(header, value);
    }

    return new Response(JSON.stringify(payload), {
        status,
        headers,
    });
}

export function isAuthorizedRevenueCatWebhookRequest(request: Request) {
    const expectedSecret = parseString(process.env.REVENUECAT_WEBHOOK_AUTH_SECRET);

    if (!expectedSecret) {
        return false;
    }

    const rawAuthorizationHeader = request.headers.get("authorization");
    if (!rawAuthorizationHeader) {
        return false;
    }

    return (
        normalizeBearerValue(rawAuthorizationHeader) === normalizeBearerValue(expectedSecret)
    );
}
