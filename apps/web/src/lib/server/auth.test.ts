import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { createWebAuthServer } from "./auth.ts";

const siteUrl = "https://test.convex.site";
const origin = "https://sapo.example";
const { publicKey, privateKey } = await generateKeyPair("RS256");
const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "test" }] });
const account = { id: "account-a", name: "Alice", email: "alice@example.com" };
const expiry = Math.floor(Date.now() / 1000) + 900;
async function token(claims: JWTPayload = {}) {
    return new SignJWT({
        ...account,
        sessionId: "session-a",
        hasActiveSubscription: true,
        ...claims,
    })
        .setProtectedHeader({ alg: "RS256", kid: "test" })
        .setIssuer(siteUrl)
        .setAudience("convex")
        .setSubject(account.id)
        .setIssuedAt()
        .setExpirationTime(expiry)
        .sign(privateKey);
}
function incoming(path = "/app/", cookie = "", init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (cookie) headers.set("cookie", cookie);
    return new Request(`${origin}${path}`, { ...init, headers });
}
function post(path: string, data: unknown, cookie = "") {
    return incoming(path, cookie, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify(data),
    });
}
function server(
    fetcher: typeof fetch = async () => {
        throw new Error("Unexpected network request");
    },
    secureCookies = true,
) {
    return createWebAuthServer({ siteUrl, secureCookies, keys, fetch: fetcher });
}
const sessionCookie = "__Secure-better-auth.session_token=session-a.signature";

test("guests require no network and leftover JWTs cannot restore a signed-out account", async () => {
    for (const cookie of ["", `__Secure-better-auth.convex_jwt=${await token()}`]) {
        const result = await server().bootstrap(incoming("/app/", cookie));
        assert.deepEqual(result.auth, { status: "signed_out", account: null });
        assert.equal(result.headers.get("cache-control"), "private, no-store");
    }
});

test("a verified cookie supplies the initial profile with no session request or exposed credentials", async () => {
    const jwt = await token();
    const result = await server().bootstrap(
        incoming("/app/", `${sessionCookie}; __Secure-better-auth.convex_jwt=${jwt}`),
    );
    assert.deepEqual(result.auth, {
        status: "authenticated",
        account: {
            userId: account.id,
            name: account.name,
            email: account.email,
            expiresAtMs: expiry * 1000,
        },
    });
    assert.ok(!JSON.stringify(result.auth).includes(jwt));
    assert.ok(!("hasActiveSubscription" in result.auth.account!));
});

test("invalid signatures, issuers, audiences, expiry and claims never become initial identity", async () => {
    const invalid = [
        "corrupt",
        (await token()).replace(/.$/, "!"),
        await new SignJWT({ sessionId: "session-a", ...account })
            .setProtectedHeader({ alg: "RS256", kid: "test" })
            .setIssuer("https://other.example")
            .setAudience("convex")
            .setSubject(account.id)
            .setIssuedAt()
            .setExpirationTime(expiry)
            .sign(privateKey),
        await new SignJWT({ sessionId: "session-a", ...account })
            .setProtectedHeader({ alg: "RS256", kid: "test" })
            .setIssuer(siteUrl)
            .setAudience("other")
            .setSubject(account.id)
            .setIssuedAt()
            .setExpirationTime(expiry)
            .sign(privateKey),
        await new SignJWT({ sessionId: "session-a", ...account })
            .setProtectedHeader({ alg: "RS256", kid: "test" })
            .setIssuer(siteUrl)
            .setAudience("convex")
            .setSubject(account.id)
            .setIssuedAt()
            .setExpirationTime(1)
            .sign(privateKey),
        await token({ sessionId: null }),
        await token({ email: {} }),
    ];
    for (const jwt of invalid) {
        let requests = 0;
        const result = await server(async () => {
            ++requests;
            return new Response(null, { status: 401 });
        }).bootstrap(incoming("/app/", `${sessionCookie}; __Secure-better-auth.convex_jwt=${jwt}`));
        assert.equal(requests, 1);
        assert.deepEqual(result.auth, { status: "signed_out", account: null });
    }
});

test("an expired cache refreshes once and forwards only authentication cookies", async () => {
    const jwt = await token();
    const result = await server(async (url, init) => {
        assert.equal(url, `${siteUrl}/api/auth/convex/token`);
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("cookie"), sessionCookie);
        assert.equal(headers.get("origin"), origin);
        assert.equal(headers.get("authorization"), null);
        assert.equal(init?.redirect, "manual");
        assert.ok(init?.signal);
        return Response.json(
            { token: jwt },
            {
                headers: {
                    "set-cookie": `__Secure-better-auth.convex_jwt=${jwt}; Domain=test.convex.site; Path=/; Secure; HttpOnly`,
                },
            },
        );
    }).bootstrap(incoming("/app/", `${sessionCookie}; unrelated=private`));
    assert.equal(result.auth.account?.name, "Alice");
    assert.match(result.headers.getSetCookie()[0], /Path=\/app; HttpOnly; SameSite=Lax; Secure$/);
    assert.ok(!result.headers.getSetCookie()[0].includes("Domain="));
});

test("network failures remain unresolved rather than signing the user out", async () => {
    const result = await server(async () => {
        throw new Error("private upstream details");
    }).bootstrap(incoming("/app/", sessionCookie));
    assert.deepEqual(result.auth, { status: "checking", account: null });
    assert.ok(!JSON.stringify(result).includes("private upstream details"));
});

test("concurrent requests cannot share account identity", async () => {
    const shared = server();
    const alice = await token();
    const bob = await new SignJWT({ name: "Bob", email: "bob@example.com", sessionId: "session-b" })
        .setProtectedHeader({ alg: "RS256", kid: "test" })
        .setIssuer(siteUrl)
        .setAudience("convex")
        .setSubject("account-b")
        .setIssuedAt()
        .setExpirationTime(expiry)
        .sign(privateKey);
    const [a, b, guest] = await Promise.all([
        shared.bootstrap(
            incoming("/app/", `${sessionCookie}; __Secure-better-auth.convex_jwt=${alice}`),
        ),
        shared.bootstrap(
            incoming("/app/", `${sessionCookie}; __Secure-better-auth.convex_jwt=${bob}`),
        ),
        shared.bootstrap(incoming()),
    ]);
    assert.equal(a.auth.account?.name, "Alice");
    assert.equal(b.auth.account?.name, "Bob");
    assert.equal(guest.auth.account, null);
});

test("the proxy rejects cross-origin requests, unsupported endpoints and non-JSON mutations", async () => {
    for (const request of [
        incoming("/app/api/auth/get-session", "", {
            headers: { origin: "https://attacker.example" },
        }),
        incoming("/app/api/auth/get-session", "", { headers: { "sec-fetch-site": "cross-site" } }),
        incoming("/app/api/auth/sign-in/demo"),
        incoming("/app/api/auth/cross-domain/one-time-token/verify"),
        incoming("/app/api/auth/sign-out", "", { method: "POST", body: "form=value" }),
    ]) {
        const response = await server().proxy(request);
        assert.ok([403, 404, 415].includes(response.status));
        assert.equal(response.headers.get("cache-control"), "private, no-store");
    }
});

test("the proxy preserves query parameters and scopes refreshed cookies to the app", async () => {
    const response = await server(async (url, init) => {
        assert.equal(url, `${siteUrl}/api/auth/get-session?disableCookieCache=true`);
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("cookie"), sessionCookie);
        assert.equal(headers.get("x-forwarded-host"), null);
        assert.equal(headers.get("better-auth-cookie"), null);
        return Response.json(
            { user: account },
            {
                headers: {
                    "set-cookie":
                        "__Secure-better-auth.session_data=snapshot; Path=/; Domain=test.convex.site; Secure",
                },
            },
        );
    }).proxy(incoming("/app/api/auth/get-session?disableCookieCache=true", sessionCookie));
    assert.equal(response.status, 200);
    assert.match(
        response.headers.get("set-cookie")!,
        /Path=\/app; HttpOnly; SameSite=Lax; Secure$/,
    );
    assert.ok(!response.headers.get("set-cookie")!.includes("Domain="));
});

test("only Vercel's trusted client IP is forwarded for backend rate limits", async () => {
    for (const vercelProxy of [false, true]) {
        const service = createWebAuthServer({
            siteUrl,
            secureCookies: true,
            keys,
            vercelProxy,
            fetch: async (_url, init) => {
                assert.equal(
                    new Headers(init?.headers).get("x-forwarded-for"),
                    vercelProxy ? "192.0.2.1" : null,
                );
                return Response.json(null);
            },
        });
        await service.proxy(
            incoming("/app/api/auth/get-session", "", {
                headers: { "x-forwarded-for": "192.0.2.1", "x-real-ip": "attacker" },
            }),
        );
    }
});

test("development cookies work on loopback without weakening production cookie attributes", async () => {
    const response = await server(async (_url, init) => {
        assert.equal(new Headers(init?.headers).get("cookie"), sessionCookie);
        return Response.json(null, {
            headers: {
                "set-cookie":
                    "__Secure-better-auth.session_token=; Max-Age=0; Path=/; Secure; HttpOnly",
            },
        });
    }, false).proxy(
        incoming("/app/api/auth/get-session", "better-auth.session_token=session-a.signature"),
    );
    assert.ok(response.headers.get("set-cookie")!.startsWith("better-auth.session_token="));
    assert.ok(!response.headers.get("set-cookie")!.includes("; Secure"));
    assert.match(response.headers.get("set-cookie")!, /Max-Age=0/);
});

test("OAuth initiation binds the fixed callback to a fresh HttpOnly browser nonce", async () => {
    let flow = "";
    const response = await server(async (_url, init) => {
        const body = JSON.parse(init?.body as string);
        const callback = new URL(body.callbackURL);
        assert.equal(callback.origin, origin);
        assert.equal(callback.pathname, "/app/auth-callback/");
        flow = callback.searchParams.get("flow")!;
        assert.ok(flow.length > 30);
        assert.equal(body.errorCallbackURL, `${origin}/app/auth/`);
        return Response.json({ url: "https://accounts.google.com/oauth" });
    }).proxy(
        post("/app/api/auth/sign-in/social", {
            provider: "google",
            callbackURL: "https://attacker.example",
        }),
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie")!, new RegExp(`__Host-sapo-auth-flow=${flow};`));
    assert.match(response.headers.get("set-cookie")!, /HttpOnly; SameSite=Lax; Secure$/);
});

test("OAuth callbacks exchange once, confirm the new account and redirect without credentials", async () => {
    const calls: string[] = [];
    const response = await server(async (url, init) => {
        calls.push(String(url));
        const cookies = new Headers(init?.headers).get("cookie");
        if (String(url).endsWith("/verify")) {
            assert.equal(cookies, "");
            assert.deepEqual(JSON.parse(init?.body as string), { token: "one-use-token" });
            return Response.json(
                { session: { token: "session-a" }, user: account },
                {
                    headers: {
                        "set-cookie":
                            "__Secure-better-auth.session_token=session-a.signature; Path=/; Secure; HttpOnly",
                    },
                },
            );
        }
        assert.equal(cookies, sessionCookie);
        return Response.json(
            { user: account },
            {
                headers: {
                    "set-cookie":
                        "__Secure-better-auth.convex_jwt=signed-profile; Path=/; Secure; HttpOnly",
                },
            },
        );
    }).callback(
        incoming(
            "/app/auth-callback/?ott=one-use-token&flow=browser-nonce",
            "__Host-sapo-auth-flow=browser-nonce; __Secure-better-auth.session_token=old-account.signature",
        ),
    );
    assert.equal(calls.length, 2);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/app/");
    assert.equal(response.headers.getSetCookie().length, 3);
    assert.equal(await response.text(), "");
});

test("OAuth callbacks reject missing or mismatched browser state before exchanging a token", async () => {
    for (const cookie of ["", "__Host-sapo-auth-flow=another-browser"]) {
        const response = await server().callback(
            incoming("/app/auth-callback/?ott=token&flow=browser-nonce", cookie),
        );
        assert.equal(response.headers.get("location"), "/app/auth/?error=sign_in_failed");
        assert.ok(
            !response.headers.getSetCookie().some((cookie) => cookie.includes("session_token=")),
        );
    }
});

test("failed callback confirmation cannot install another account", async () => {
    const response = await server(async (url) =>
        String(url).endsWith("/verify")
            ? Response.json(
                  { session: { token: "session-a" }, user: account },
                  { headers: { "set-cookie": sessionCookie } },
              )
            : Response.json({ user: { ...account, id: "different" } }),
    ).callback(
        incoming(
            "/app/auth-callback/?ott=token&flow=browser-nonce",
            "__Host-sapo-auth-flow=browser-nonce",
        ),
    );
    assert.equal(response.headers.get("location"), "/app/auth/?error=sign_in_failed");
    assert.ok(!response.headers.getSetCookie().some((cookie) => cookie.includes("session_token=")));
});

test("legacy credentials are validated against the session record before migration", async () => {
    const response = await server(async (url) => {
        assert.equal(url, `${siteUrl}/api/auth/get-session?disableCookieCache=true`);
        return Response.json(
            {
                user: account,
                session: { token: "session-a", expiresAt: "2099-01-01T00:00:00.000Z" },
            },
            {
                headers: {
                    "set-cookie":
                        "__Secure-better-auth.convex_jwt=signed-profile; Path=/; Secure; HttpOnly",
                },
            },
        );
    }).proxy(post("/app/api/auth/migrate", { cookies: sessionCookie }));
    assert.deepEqual(await response.json(), { migrated: true });
    assert.equal(response.headers.getSetCookie().length, 2);
    assert.match(
        response.headers.getSetCookie()[0],
        /session_token=session-a.signature; Path=\/app; HttpOnly/,
    );
});

test("migration never replaces first-party credentials or accepts expired legacy credentials", async () => {
    const current = await server().proxy(
        post(
            "/app/api/auth/migrate",
            { cookies: sessionCookie },
            "__Secure-better-auth.session_token=new-session.signature",
        ),
    );
    assert.deepEqual(await current.json(), { migrated: false });
    const expired = await server(async () => new Response(null, { status: 401 })).proxy(
        post("/app/api/auth/migrate", { cookies: sessionCookie }),
    );
    assert.deepEqual(await expired.json(), { migrated: false });
    assert.equal(expired.headers.getSetCookie().length, 0);
});
