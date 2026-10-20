import assert from "node:assert/strict";
import { test } from "node:test";
import {
    clearLegacyAuth,
    migrateLegacySession,
    readLegacyAccountPreview,
} from "../src/lib/auth-legacy.ts";

function storage() {
    const values = new Map<string, string>([
        [
            "better-auth_cookie",
            JSON.stringify({
                "__Secure-better-auth.session_token": {
                    value: "session-a.signature",
                    expires: "2099-01-01",
                },
            }),
        ],
        [
            "better-auth_session_data",
            JSON.stringify({
                user: { id: "account-a", name: "Alice" },
                session: { userId: "account-a", token: "session-a", expiresAt: "2099-01-01" },
            }),
        ],
        ["preferences", "keep"],
    ]);
    return {
        values,
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
    };
}

test("legacy profile data is display-only and credentials migrate once", async (context) => {
    const legacy = storage();
    Object.assign(globalThis, { localStorage: legacy });
    assert.equal(readLegacyAccountPreview()?.name, "Alice");
    let calls = 0;
    context.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
        ++calls;
        assert.equal(url, "/app/api/auth/migrate");
        assert.equal(init?.credentials, "same-origin");
        assert.equal(
            JSON.parse(init?.body as string).cookies,
            "__Secure-better-auth.session_token=session-a.signature",
        );
        return Response.json({ migrated: true });
    });
    assert.equal(await migrateLegacySession(), true);
    assert.equal(await migrateLegacySession(), false);
    assert.equal(calls, 1);
    assert.equal(legacy.values.get("preferences"), "keep");
    assert.equal(readLegacyAccountPreview(), null);
});

test("temporary migration failures keep credentials for a later retry", async (context) => {
    const legacy = storage();
    Object.assign(globalThis, { localStorage: legacy });
    context.mock.method(globalThis, "fetch", async () => new Response(null, { status: 503 }));
    await assert.rejects(migrateLegacySession());
    assert.ok(legacy.values.has("better-auth_cookie"));
});

test("expired or unavailable legacy storage never blocks cookie authentication", async (context) => {
    const legacy = storage();
    Object.assign(globalThis, { localStorage: legacy });
    legacy.values.set(
        "better-auth_cookie",
        JSON.stringify({
            "__Secure-better-auth.session_token": {
                value: "expired.signature",
                expires: "2000-01-01",
            },
        }),
    );
    assert.equal(await migrateLegacySession(), false);
    assert.equal(readLegacyAccountPreview(), null);
    context.mock.method(legacy, "getItem", () => {
        throw new Error("Unavailable");
    });
    assert.equal(await migrateLegacySession(), false);
    assert.equal(readLegacyAccountPreview(), null);
    clearLegacyAuth();
});
