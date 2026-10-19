import assert from "node:assert/strict";
import { test } from "node:test";
import { crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { readAccountPreview } from "../src/lib/auth-preview.ts";

const expiresAt = "2099-01-01T00:00:00.000Z";
function sessionData() {
    return {
        user: { id: "user-a", name: "Alice" },
        session: { userId: "user-a", token: "session-a", expiresAt },
    };
}
function cache(
    data: unknown = sessionData(),
    cookie = "better-auth.session_token=session-a.signature",
) {
    return { getSessionData: () => data, getCookie: () => cookie };
}

test("reads only display fields and expiry from the existing Better Auth session cache", () => {
    const data = {
        ...sessionData(),
        hasActiveSubscription: true,
        status: "authenticated",
        user: {
            ...sessionData().user,
            email: "private@example.com",
            image: "https://untrusted.example/avatar",
        },
    };
    assert.deepEqual(readAccountPreview(cache(data)), {
        userId: "user-a",
        name: "Alice",
        expiresAtMs: Date.parse(expiresAt),
    });
    assert.equal(
        readAccountPreview(cache({ ...data, user: { ...data.user, name: "  " } }))?.name,
        null,
    );
});

test("rejects malformed, expired, and mismatched cache entries", () => {
    const valid = sessionData();
    for (const value of [
        null,
        [],
        {},
        { user: valid.user },
        { ...valid, user: [] },
        { ...valid, user: { ...valid.user, id: 123 } },
        { ...valid, user: { ...valid.user, name: {} } },
        { ...valid, user: { ...valid.user, name: "x".repeat(257) } },
        { ...valid, session: { ...valid.session, userId: "other-user" } },
        { ...valid, session: { ...valid.session, token: "" } },
        { ...valid, session: { ...valid.session, expiresAt: "invalid" } },
        { ...valid, session: { ...valid.session, expiresAt: 123 } },
        { ...valid, session: { ...valid.session, expiresAt: "2000-01-01T00:00:00.000Z" } },
    ]) {
        assert.equal(readAccountPreview(cache(value)), null);
    }
    assert.equal(readAccountPreview(cache(valid), Date.parse(expiresAt)), null);
    for (const cookie of [
        "",
        "better-auth.convex_jwt=jwt",
        "better-auth.session_token=other-session.signature",
        "better-auth.session_token=session-ab.signature",
        "better-auth.session_token=session-a.",
        "better-auth.session_token=%invalid",
        "better-auth.session_token=session-a.signature; __Secure-better-auth.session_token=other-session.signature",
    ]) {
        assert.equal(readAccountPreview(cache(valid, cookie)), null);
    }
    assert.equal(
        readAccountPreview(
            cache(valid, "__Secure-better-auth.session_token=session-a.signature%3D"),
        )?.name,
        "Alice",
    );
});

test("unavailable browser storage does not block session verification", () => {
    for (const method of ["getSessionData", "getCookie"] as const) {
        assert.equal(
            readAccountPreview({
                ...cache(),
                [method]: () => {
                    throw new Error("Storage unavailable");
                },
            }),
            null,
        );
    }
});

test("integrates with the installed cross-domain plugin's cookie expiry and cache clearing", async () => {
    const values = new Map<string, string>([
        ["better-auth_session_data", JSON.stringify(sessionData())],
        [
            "better-auth_cookie",
            JSON.stringify({
                "__Secure-better-auth.session_token": {
                    value: "session-a.signature",
                    expires: expiresAt,
                },
            }),
        ],
    ]);
    const plugin = crossDomainClient({
        storage: {
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => {
                values.set(key, value);
            },
        },
    });
    const client = plugin.getActions({} as never, { notify() {} } as never, undefined);
    assert.equal(readAccountPreview(client)?.name, "Alice");
    values.set(
        "better-auth_cookie",
        JSON.stringify({
            "__Secure-better-auth.session_token": {
                value: "session-a.signature",
                expires: "2000-01-01",
            },
        }),
    );
    assert.equal(readAccountPreview(client), null);
    values.set("better-auth_session_data", "corrupt-json");
    assert.equal(readAccountPreview(client), null);
    values.set("better-auth_session_data", JSON.stringify(sessionData()));
    const onSuccess = plugin.fetchPlugins?.[0].hooks?.onSuccess;
    assert.ok(onSuccess);
    await onSuccess({
        response: new Response(null),
        request: { url: "https://test.convex.site/api/auth/get-session" },
        data: null,
    } as never);
    assert.equal(readAccountPreview(client), null);
    assert.equal(values.get("better-auth_session_data"), "null");
});
