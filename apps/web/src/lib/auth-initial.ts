import { createIsomorphicFn } from "@tanstack/solid-start";
import { redirect } from "@tanstack/solid-router";
import { isTranslatorPath, translatorBase } from "./translator-paths";
import type { AuthBootstrap } from "./auth-bootstrap";

export const loadInitialAuth = createIsomorphicFn()
    .server(async (): Promise<AuthBootstrap | undefined> => {
        const { getRequest, setResponseHeader } = await import("@tanstack/solid-start/server");
        const request = getRequest();
        const url = new URL(request.url);
        // Public pages remain static. Only the translator has personalized HTML.
        if (!isTranslatorPath(url.pathname)) return undefined;
        setResponseHeader("cache-control", "private, no-store");
        setResponseHeader("referrer-policy", "no-referrer");
        const token = url.searchParams.get("ott");
        if (token)
            throw redirect({
                to: `${translatorBase(url.pathname)}/auth-callback/`,
                href: `${translatorBase(url.pathname)}/auth-callback/?ott=${encodeURIComponent(token)}`,
                statusCode: 303,
            });
        const { getWebAuthServer } = await import("./server/auth");
        const server = getWebAuthServer();
        if (!server) return { status: "signed_out", account: null };
        const result = await server.bootstrap(request);
        const cookies = result.headers.getSetCookie();
        if (cookies.length) setResponseHeader("set-cookie", cookies);
        // Existing browser sessions may still have only the old /app cookie.
        // Let the shared auth API check those before declaring a PWA visitor signed out.
        if (translatorBase(url.pathname) === "/pwa" && result.auth.status === "signed_out")
            return { status: "checking", account: null };
        return result.auth;
    })
    .client((): AuthBootstrap | undefined => undefined);
