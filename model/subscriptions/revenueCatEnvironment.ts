import { parseString } from "../valueParsing";

const REVENUECAT_WEBHOOK_ENVIRONMENTS = ["SANDBOX", "PRODUCTION"] as const;

type RevenueCatWebhookEnvironment =
    (typeof REVENUECAT_WEBHOOK_ENVIRONMENTS)[number];

export type RevenueCatWebhookEnvironmentDisposition =
    | "match"
    | "mismatch"
    | "invalid_event_environment"
    | "invalid_configuration";

function isRevenueCatWebhookEnvironment(
    value: string
): value is RevenueCatWebhookEnvironment {
    return REVENUECAT_WEBHOOK_ENVIRONMENTS.some((environment) => environment === value);
}

export function getRevenueCatWebhookEnvironmentDisposition(
    eventEnvironment: string | undefined,
    configuredEnvironment: string | undefined,
    appUserId?: string,
    demoAccessUserId = process.env.DEMO_ACCESS_USER_ID
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

    if (parsedEventEnvironment === parsedConfiguredEnvironment) return "match";

    return parsedConfiguredEnvironment === "PRODUCTION" &&
        parsedEventEnvironment === "SANDBOX" &&
        Boolean(demoAccessUserId) && appUserId === demoAccessUserId
        ? "match"
        : "mismatch";
}

export function assertRevenueCatEnvironmentConfigured() {
    if (getRevenueCatWebhookEnvironmentDisposition(undefined, process.env.REVENUECAT_WEBHOOK_ENVIRONMENT)
        === "invalid_configuration") {
        throw new Error("Missing or invalid REVENUECAT_WEBHOOK_ENVIRONMENT");
    }
}

export function isRevenueCatEnvironmentAllowedForUser(
    environment: string | undefined,
    appUserId: string
) {
    const disposition = getRevenueCatWebhookEnvironmentDisposition(
        environment, process.env.REVENUECAT_WEBHOOK_ENVIRONMENT, appUserId
    );
    if (disposition === "invalid_configuration") {
        throw new Error("Missing or invalid REVENUECAT_WEBHOOK_ENVIRONMENT");
    }
    return disposition === "match";
}
