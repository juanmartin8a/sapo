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

export function getRevenueCatWebhookResponseHeaders() {
    return new Headers({
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
}

export function jsonRevenueCatWebhookResponse(status: number, payload: Record<string, unknown>) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: getRevenueCatWebhookResponseHeaders(),
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
