import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createTestServer } from "../helpers/vite.ts";

Object.assign(globalThis, { window: { location: { origin: "https://sapo.example" } } });
const server = await createTestServer({
    define: {
        "import.meta.env.VITE_CONVEX_URL": JSON.stringify("https://test.convex.cloud"),
        "import.meta.env.VITE_CONVEX_SITE_URL": JSON.stringify("https://test.convex.site"),
    },
});
after(() => server.close());
const originalFetch = globalThis.fetch;
let fetchRequest: typeof fetch = async () => {
    throw new Error("Unexpected request");
};
globalThis.fetch = (...args) => fetchRequest(...args);
after(() => {
    globalThis.fetch = originalFetch;
});
const auth = (await server.ssrLoadModule(
    "/src/lib/auth-client.ts",
)) as typeof import("../../src/lib/auth-client.ts");
function jwt(userId = "account-a", expires = Math.floor(Date.now() / 1000) + 900) {
    return `${btoa(JSON.stringify({ alg: "RS256" }))}.${btoa(JSON.stringify({ sub: userId, exp: expires }))}.signature`;
}

test("the browser uses first-party auth URLs and coalesces token requests", async () => {
    auth.clearConvexAccessToken();
    let calls = 0;
    fetchRequest = async (url) => {
        assert.equal(String(url), "https://sapo.example/app/api/auth/convex/token");
        ++calls;
        return Response.json({ token: jwt() });
    };
    const [first, second] = await Promise.all([
        auth.getConvexAccessToken(),
        auth.getConvexAccessToken(),
    ]);
    assert.equal(first, second);
    await auth.getConvexAccessToken();
    assert.equal(calls, 1);
    await auth.getConvexAccessToken(true);
    assert.equal(calls, 2);
});

test("session changes invalidate a cached token before the next account uses it", async () => {
    auth.clearConvexAccessToken();
    let userId = "account-a";
    let calls = 0;
    fetchRequest = async (url) => {
        if (String(url).endsWith("/get-session")) return Response.json({ user: { id: userId } });
        ++calls;
        return Response.json({ token: jwt(userId) });
    };
    const first = await auth.getConvexAccessToken();
    userId = "account-b";
    await auth.getAuthClient().getSession();
    const second = await auth.getConvexAccessToken();
    assert.notEqual(first, second);
    assert.equal(calls, 2);
});

test("a token response arriving after sign-out cannot restore the token cache", async () => {
    auth.clearConvexAccessToken();
    let finish!: (response: Response) => void;
    fetchRequest = () =>
        new Promise((resolve) => {
            finish = resolve;
        });
    const pending = auth.getConvexAccessToken();
    await new Promise<void>((resolve) => setImmediate(resolve));
    auth.clearConvexAccessToken();
    finish(Response.json({ token: jwt() }));
    await assert.rejects(pending, /account changed/);
});
