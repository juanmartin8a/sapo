import { POST_OPTIONS_METHODS } from "../../constants/http";
import { buildCorsResponseHeaders } from "../http/cors";
import { jsonResponse } from "../http/responses";
import { parseString } from "../valueParsing";

const REVENUECAT_WEBHOOK_ENVIRONMENTS = ["SANDBOX", "PRODUCTION"] as const;

type RevenueCatWebhookEnvironment =
    (typeof REVENUECAT_WEBHOOK_ENVIRONMENTS)[number];

export type RevenueCatWebhookEnvironmentDisposition =
    | "match"
    | "mismatch"
    | "invalid_event_environment"
    | "invalid_configuration";

function normalizeBearerValue(value: string): string {
    return value.replace(/^Bearer\s+/i, "").trim();
}

export function getRevenueCatWebhookResponseHeaders(request: Request) {
    return buildCorsResponseHeaders(request, {
        contentType: "application/json",
        allowedMethods: POST_OPTIONS_METHODS,
    });
}

export function jsonRevenueCatWebhookResponse(
    request: Request,
    status: number,
    payload: Record<string, unknown>,
    extraHeaders?: Record<string, string>
) {
    return jsonResponse(
        request,
        status,
        payload,
        getRevenueCatWebhookResponseHeaders,
        extraHeaders
    );
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

function isRevenueCatWebhookEnvironment(
    value: string
): value is RevenueCatWebhookEnvironment {
    return REVENUECAT_WEBHOOK_ENVIRONMENTS.some((environment) => environment === value);
}

export function getRevenueCatWebhookEnvironmentDisposition(
    eventEnvironment: string | undefined,
    configuredEnvironment: string | undefined
): RevenueCatWebhookEnvironmentDisposition {
    const parsedConfiguredEnvironment = parseString(configuredEnvironment);
    if (
        !parsedConfiguredEnvironment ||
        !isRevenueCatWebhookEnvironment(parsedConfiguredEnvironment)
    ) {
        return "invalid_configuration";
    }

    const parsedEventEnvironment = parseString(eventEnvironment)?.toUpperCase();
    if (!parsedEventEnvironment || !isRevenueCatWebhookEnvironment(parsedEventEnvironment)) {
        return "invalid_event_environment";
    }

    return parsedEventEnvironment === parsedConfiguredEnvironment ? "match" : "mismatch";
}
