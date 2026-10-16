import { isAllowedCorsRequest } from "./cors";

type ResponseHeadersFactory = (request: Request) => Headers;

export function handleCorsOptionsRequest(
    request: Request,
    getResponseHeaders: ResponseHeadersFactory
) {
    return new Response(null, {
        status: isAllowedCorsRequest(request) ? 204 : 403,
        headers: getResponseHeaders(request),
    });
}

export function jsonResponse(
    request: Request,
    status: number,
    payload: Record<string, unknown>,
    getResponseHeaders: ResponseHeadersFactory,
    extraHeaders?: Record<string, string>
) {
    const headers = getResponseHeaders(request);

    for (const [header, value] of Object.entries(extraHeaders ?? {})) {
        headers.set(header, value);
    }

    return new Response(JSON.stringify(payload), { status, headers });
}
