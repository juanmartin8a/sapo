import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { parseSetCookieHeader, splitSetCookieHeader } from "better-auth/cookies";
import { AUTH_BASE_PATH, type AuthBootstrap } from "../auth-bootstrap.ts";
import { isIP } from "node:net";

const COOKIE_PREFIX = "__Secure-better-auth.";
const PRIVATE_HEADERS = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
};
const signedOut: AuthBootstrap = { status: "signed_out", account: null };
const checking: AuthBootstrap = { status: "checking", account: null };
const ENDPOINTS = new Set([
    "GET /get-session",
    "GET /convex/token",
    "POST /sign-in/social",
    "POST /sign-out",
    "POST /delete-user",
    "POST /migrate",
]);

// Only public keys are cached across requests. Identity is always request-local.
export function createWebAuthServer(options: {
    siteUrl: string;
    secureCookies: boolean;
    vercelProxy?: boolean;
    fetch?: typeof fetch;
    keys?: JWTVerifyGetKey;
}) {
    const siteUrl = new URL(options.siteUrl).origin;
    if (new URL(siteUrl).protocol !== "https:") throw new Error("Convex auth requires HTTPS.");
    const request = options.fetch ?? fetch;
    const flowCookieName = options.secureCookies ? "__Host-sapo-auth-flow" : "sapo-auth-flow";
    const flowCookie = (value: string, maxAge: number) =>
        `${flowCookieName}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${options.secureCookies ? "; Secure" : ""}`;
    const keys =
        options.keys ??
        createRemoteJWKSet(new URL(`${siteUrl}/api/auth/convex/jwks`), {
            timeoutDuration: 3000,
        });

    function authCookies(value: string | null) {
        return (value ?? "")
            .split(";")
            .map((cookie) => cookie.trim())
            .filter((cookie) => /^(?:__Secure-)?better-auth\.[\w.-]+=/.test(cookie))
            .map((cookie) => (cookie.startsWith("better-auth.") ? `__Secure-${cookie}` : cookie))
            .join("; ");
    }

    function cookieValue(cookies: string, name: string) {
        const matches = cookies
            .split("; ")
            .filter((cookie) => cookie.startsWith(`${COOKIE_PREFIX}${name}=`));
        if (matches.length !== 1) return null;
        try {
            return decodeURIComponent(matches[0].slice(matches[0].indexOf("=") + 1));
        } catch {
            return null;
        }
    }

    function setCookies(response: Response) {
        const value = response.headers.get("set-cookie");
        if (!value) return [];
        return splitSetCookieHeader(value).flatMap((cookie) => {
            const [name] = cookie.split("=");
            if (!/^(?:__Secure-)?better-auth\.[\w.-]+$/.test(name)) return [];
            // Scope credentials to the app, and never inherit an upstream domain.
            let scoped = cookie
                .replace(/;\s*Domain=[^;]*/gi, "")
                .replace(/;\s*Path=[^;]*/gi, "")
                .replace(/;\s*SameSite=[^;]*/gi, "")
                .replace(/;\s*Secure\b/gi, "")
                .replace(/;\s*HttpOnly\b/gi, "");
            if (!options.secureCookies) scoped = scoped.replace(/^__Secure-/, "");
            return [
                `${scoped}; Path=/app; HttpOnly; SameSite=Lax${options.secureCookies ? "; Secure" : ""}`,
            ];
        });
    }

    async function upstream(
        incoming: Request,
        path: string,
        init: { method?: string; body?: string; cookies?: string } = {},
    ) {
        const headers = new Headers({
            accept: "application/json",
            cookie: init.cookies ?? authCookies(incoming.headers.get("cookie")),
            origin: new URL(incoming.url).origin,
        });
        if (init.body) headers.set("content-type", "application/json");
        const userAgent = incoming.headers.get("user-agent");
        if (userAgent) headers.set("user-agent", userAgent);
        // Vercel overwrites this header. Preserve per-client rate limits only
        // behind that trusted ingress; never accept arbitrary forwarded IPs.
        if (options.vercelProxy) {
            const ip = incoming.headers.get("x-forwarded-for")?.split(",")[0].trim();
            if (ip && isIP(ip)) headers.set("x-forwarded-for", ip);
        }
        return request(`${siteUrl}/api/auth${path}`, {
            method: init.method ?? "GET",
            headers,
            body: init.body,
            redirect: "manual",
            cache: "no-store",
            signal: AbortSignal.timeout(5000),
        });
    }

    async function verify(token: string): Promise<AuthBootstrap> {
        const { payload } = await jwtVerify(token, keys, {
            issuer: siteUrl,
            audience: "convex",
            algorithms: ["RS256", "EdDSA"],
            requiredClaims: ["sub", "exp", "iat", "sessionId"],
        });
        if (
            !payload.sub ||
            typeof payload.sessionId !== "string" ||
            typeof payload.email !== "string" ||
            payload.email.length > 320 ||
            (payload.name != null &&
                (typeof payload.name !== "string" || payload.name.length > 256))
        )
            throw new Error("Invalid account snapshot.");
        return {
            status: "authenticated",
            account: {
                userId: payload.sub,
                name: typeof payload.name === "string" ? payload.name : null,
                email: payload.email,
                expiresAtMs: payload.exp! * 1000,
            },
        };
    }

    async function bootstrap(incoming: Request) {
        const cookies = authCookies(incoming.headers.get("cookie"));
        const headers = new Headers(PRIVATE_HEADERS);
        if (!cookieValue(cookies, "session_token")) return { auth: signedOut, headers };
        const token = cookieValue(cookies, "convex_jwt");
        if (token) {
            try {
                return { auth: await verify(token), headers };
            } catch {
                // An expired cache needs one refresh; never trust decoded claims.
            }
        }
        try {
            const response = await upstream(incoming, "/convex/token");
            for (const cookie of setCookies(response)) headers.append("set-cookie", cookie);
            if (response.status === 401 || response.status === 403) {
                for (const name of ["session_token", "convex_jwt"])
                    headers.append(
                        "set-cookie",
                        `${options.secureCookies ? COOKIE_PREFIX : "better-auth."}${name}=; Path=/app; Max-Age=0; HttpOnly; SameSite=Lax${options.secureCookies ? "; Secure" : ""}`,
                    );
                return { auth: signedOut, headers };
            }
            if (!response.ok) return { auth: checking, headers };
            const data = (await response.json()) as { token?: unknown };
            const auth = typeof data.token === "string" ? await verify(data.token) : checking;
            return { auth, headers };
        } catch {
            return { auth: checking, headers };
        }
    }

    async function proxy(incoming: Request) {
        const url = new URL(incoming.url);
        const path = url.pathname.slice(AUTH_BASE_PATH.length).replace(/\/$/, "");
        const origin = incoming.headers.get("origin");
        if (
            (origin && origin !== url.origin) ||
            incoming.headers.get("sec-fetch-site") === "cross-site"
        )
            return new Response(null, { status: 403, headers: PRIVATE_HEADERS });
        if (!ENDPOINTS.has(`${incoming.method} ${path}`))
            return new Response(null, { status: 404, headers: PRIVATE_HEADERS });
        if (
            incoming.method === "POST" &&
            !incoming.headers.get("content-type")?.startsWith("application/json")
        )
            return new Response(null, { status: 415, headers: PRIVATE_HEADERS });
        try {
            if (path === "/migrate") return await migrate(incoming);
            let body = incoming.method === "POST" ? await incoming.text() : undefined;
            if (body && body.length > 16_384)
                return new Response(null, { status: 413, headers: PRIVATE_HEADERS });
            let flow: string | undefined;
            if (path === "/sign-in/social") {
                const data = JSON.parse(body ?? "{}");
                if (!["google", "apple"].includes(data.provider))
                    return new Response(null, { status: 400, headers: PRIVATE_HEADERS });
                flow = crypto.randomUUID();
                data.callbackURL = `${url.origin}/app/auth-callback/?flow=${flow}`;
                data.errorCallbackURL = `${url.origin}/app/auth/`;
                body = JSON.stringify(data);
            }
            const response = await upstream(incoming, `${path}${url.search}`, {
                method: incoming.method,
                body,
            });
            const headers = new Headers(PRIVATE_HEADERS);
            headers.set("content-type", response.headers.get("content-type") ?? "application/json");
            const retryAfter = response.headers.get("retry-after");
            if (retryAfter) headers.set("retry-after", retryAfter);
            for (const cookie of setCookies(response)) headers.append("set-cookie", cookie);
            if (flow && response.ok) headers.append("set-cookie", flowCookie(flow, 600));
            const location = response.headers.get("location");
            if (location) headers.set("location", location);
            return new Response(response.body, { status: response.status, headers });
        } catch {
            return Response.json(
                { message: "Authentication is temporarily unavailable. Please try again." },
                { status: 503, headers: PRIVATE_HEADERS },
            );
        }
    }

    async function migrate(incoming: Request) {
        const headers = new Headers(PRIVATE_HEADERS);
        if (incoming.method !== "POST") return new Response(null, { status: 405, headers });
        // A current browser session always takes precedence over an old cache.
        if (cookieValue(authCookies(incoming.headers.get("cookie")), "session_token"))
            return Response.json({ migrated: false }, { headers });
        const body = (await incoming.json()) as { cookies?: unknown };
        if (typeof body.cookies !== "string" || body.cookies.length > 16_384)
            return new Response(null, { status: 400, headers });
        const cookies = authCookies(body.cookies);
        const token = cookieValue(cookies, "session_token");
        if (!token) return Response.json({ migrated: false }, { headers });
        // Validate with the actual session record before accepting legacy credentials.
        const response = await upstream(incoming, "/get-session?disableCookieCache=true", {
            cookies,
        });
        if (response.status === 401 || response.status === 403)
            return Response.json({ migrated: false }, { headers });
        if (!response.ok) throw new Error("Session migration unavailable.");
        const data = (await response.json()) as {
            session?: { token?: unknown; expiresAt?: string };
            user?: { id?: unknown };
        } | null;
        const rawToken = data?.session?.token;
        const expiry = Date.parse(data?.session?.expiresAt ?? "");
        if (
            typeof rawToken !== "string" ||
            !data?.user?.id ||
            !token.startsWith(`${rawToken}.`) ||
            !Number.isFinite(expiry) ||
            expiry <= Date.now()
        )
            return Response.json({ migrated: false }, { headers });
        headers.append(
            "set-cookie",
            `${options.secureCookies ? COOKIE_PREFIX : "better-auth."}session_token=${encodeURIComponent(token)}; Path=/app; HttpOnly; SameSite=Lax; Expires=${new Date(expiry).toUTCString()}${options.secureCookies ? "; Secure" : ""}`,
        );
        for (const cookie of setCookies(response)) headers.append("set-cookie", cookie);
        return Response.json({ migrated: true }, { headers });
    }

    async function callback(incoming: Request) {
        const url = new URL(incoming.url);
        const token = url.searchParams.get("ott");
        const flow = url.searchParams.get("flow");
        const expectedFlow = (incoming.headers.get("cookie") ?? "")
            .split(";")
            .map((cookie) => cookie.trim())
            .find((cookie) => cookie.startsWith(`${flowCookieName}=`))
            ?.slice(flowCookieName.length + 1);
        const headers = new Headers(PRIVATE_HEADERS);
        headers.set("location", "/app/auth/?error=sign_in_failed");
        // Bind the callback to the browser that started sign-in, including OTT flows.
        if (!token || token.length > 2048 || !flow || flow !== expectedFlow)
            return new Response(null, { status: 303, headers });
        headers.append("set-cookie", flowCookie("", 0));
        try {
            const response = await upstream(incoming, "/cross-domain/one-time-token/verify", {
                method: "POST",
                body: JSON.stringify({ token }),
                // A callback must not inherit the previous account's cached session.
                cookies: "",
            });
            if (!response.ok) return new Response(null, { status: 303, headers });
            const data = (await response.json()) as {
                session?: { token?: unknown };
                user?: { id?: unknown };
            };
            const cookies = setCookies(response);
            if (typeof data.session?.token !== "string" || cookies.length === 0)
                return new Response(null, { status: 303, headers });
            // Reading the new session also seeds Convex's signed profile JWT.
            const cookieHeader = [...parseSetCookieHeader(response.headers.get("set-cookie") ?? "")]
                .map(([name, cookie]) => `${name}=${cookie.value}`)
                .join("; ");
            const session = await upstream(incoming, "/get-session", { cookies: cookieHeader });
            if (!session.ok) return new Response(null, { status: 303, headers });
            const confirmed = (await session.json()) as { user?: { id?: unknown } } | null;
            if (!confirmed?.user?.id || confirmed.user.id !== data.user?.id)
                return new Response(null, { status: 303, headers });
            for (const cookie of cookies) headers.append("set-cookie", cookie);
            for (const cookie of setCookies(session)) headers.append("set-cookie", cookie);
            headers.set("location", "/app/");
            return new Response(null, { status: 303, headers });
        } catch {
            return new Response(null, { status: 303, headers });
        }
    }

    return { bootstrap, proxy, callback };
}

let server: ReturnType<typeof createWebAuthServer> | undefined;
export function getWebAuthServer() {
    if (!import.meta.env.VITE_CONVEX_SITE_URL) return null;
    return (server ??= createWebAuthServer({
        siteUrl: import.meta.env.VITE_CONVEX_SITE_URL,
        secureCookies: import.meta.env.PROD,
        vercelProxy: process.env.VERCEL === "1",
    }));
}
