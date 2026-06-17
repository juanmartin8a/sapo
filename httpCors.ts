import { parseString } from "./subscriptionsConfig";

type CorsHeadersOptions = {
    contentType?: string;
    cacheControl?: string;
    allowedMethods: string;
    allowedHeaders?: string;
    extraHeaders?: Record<string, string>;
};

function getConfiguredClientOrigins() {
    const clientOrigin = parseString(process.env.CLIENT_ORIGIN);

    if (!clientOrigin) {
        return [] as string[];
    }

    return clientOrigin
        .split(",")
        .map((origin) => parseString(origin))
        .filter((origin): origin is string => typeof origin === "string");
}

export function getAllowedCorsOrigin(request: Request) {
    const requestOrigin = request.headers.get("origin");
    const configuredOrigins = getConfiguredClientOrigins();

    if (!requestOrigin) {
        return null;
    }

    if (configuredOrigins.includes(requestOrigin)) {
        return requestOrigin;
    }

    return null;
}

export function isAllowedCorsRequest(request: Request) {
    return !request.headers.get("origin") || getAllowedCorsOrigin(request) !== null;
}

export function buildCorsResponseHeaders(request: Request, options: CorsHeadersOptions) {
    const headers = new Headers({
        ...(options.contentType ? { "Content-Type": options.contentType } : {}),
        ...(options.cacheControl ? { "Cache-Control": options.cacheControl } : {}),
        "Access-Control-Allow-Methods": options.allowedMethods,
        "Access-Control-Allow-Headers": options.allowedHeaders ?? "Content-Type, Authorization",
        Vary: "Origin",
        ...(options.extraHeaders ?? {}),
    });
    const allowedOrigin = getAllowedCorsOrigin(request);

    if (allowedOrigin) {
        headers.set("Access-Control-Allow-Origin", allowedOrigin);
    }

    return headers;
}
