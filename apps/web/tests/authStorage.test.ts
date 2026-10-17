import assert from "node:assert/strict";
import { test } from "node:test";
import { crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { isAuthSessionStorageChange } from "../src/lib/auth-storage.ts";

test("Convex JWT renewal and session-cache writes do not trigger cross-tab refresh loops", async () => {
    const cookies = JSON.stringify({
        "better-auth.session_token": { value: "session-a", expires: null },
    });
    const values = new Map([["better-auth_cookie", cookies]]);
    const events: Pick<StorageEvent, "key" | "oldValue" | "newValue">[] = [];
    const storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, newValue: string) => {
            const oldValue = values.get(key) ?? null;
            values.set(key, newValue);
            if (oldValue !== newValue) events.push({ key, oldValue, newValue });
        },
    };
    const plugin = crossDomainClient({ storage });
    const onSuccess = plugin.fetchPlugins?.[0].hooks?.onSuccess;
    assert.ok(onSuccess);
    for (const jwt of ["jwt-first", "jwt-renewed"]) {
        await onSuccess({
            response: new Response(null, {
                headers: {
                    "set-better-auth-cookie": `better-auth.convex_jwt=${jwt}; Max-Age=900; Path=/`,
                },
            }),
            request: {
                url: "https://backend.convex.site/api/auth/get-session",
            },
            data: { user: { id: "user-a" }, session: { id: "session-a" } },
        } as never);
    }
    assert.ok(events.some((event) => event.key === "better-auth_cookie"));
    assert.ok(events.some((event) => event.key === "better-auth_session_data"));
    assert.equal(events.filter(isAuthSessionStorageChange).length, 0);
});

test("sign-in, sign-out, and account changes still refresh other tabs", () => {
    const cookie = (value: string) =>
        JSON.stringify({
            "__Secure-better-auth.session_token": { value, expires: null },
        });
    for (const [oldValue, newValue] of [
        [null, cookie("session-a")],
        [cookie("session-a"), "{}"],
        [cookie("session-a"), cookie("session-b")],
    ]) {
        assert.equal(
            isAuthSessionStorageChange({
                key: "better-auth_cookie",
                oldValue,
                newValue,
            }),
            true,
        );
    }
    assert.equal(
        isAuthSessionStorageChange({
            key: null,
            oldValue: null,
            newValue: null,
        }),
        true,
    );
});

test("cookie expiry metadata and unrelated preferences do not change session identity", () => {
    const cookie = (expires: string) =>
        JSON.stringify({
            "better-auth.session_token": { value: "same-session", expires },
        });
    assert.equal(
        isAuthSessionStorageChange({
            key: "better-auth_cookie",
            oldValue: cookie("2026-10-16"),
            newValue: cookie("2026-11-16"),
        }),
        false,
    );
    assert.equal(
        isAuthSessionStorageChange({
            key: "sapo.web.preferences.v1",
            oldValue: null,
            newValue: "{}",
        }),
        false,
    );
    assert.equal(
        isAuthSessionStorageChange({
            key: "better-auth_cookie",
            oldValue: "{}",
            newValue: "invalid JSON",
        }),
        true,
    );
});
