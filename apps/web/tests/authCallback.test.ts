import assert from "node:assert/strict";
import { test } from "node:test";
import { exchangeSignInCallback } from "../src/lib/auth-callback.ts";

test("exchanges the Convex OAuth callback before loading the session", async () => {
    const actions: string[] = [];
    await exchangeSignInCallback(
        "https://sapo.example/?ott=one-use-token&view=home#top",
        {
            crossDomain: {
                oneTimeToken: {
                    verify: async ({ token }) => {
                        actions.push(`verify:${token}`);
                        return {
                            data: { session: { token: "session-token" } },
                        };
                    },
                },
            },
            getSession: async ({ fetchOptions }) => {
                actions.push(fetchOptions.headers.Authorization);
                return {};
            },
            updateSession: () => {
                actions.push("notify");
            },
        },
        (url) => {
            actions.push(`replace:${url}`);
        },
    );
    assert.deepEqual(actions, [
        "replace:/?view=home#top",
        "verify:one-use-token",
        "Bearer session-token",
        "notify",
    ]);
});

test("a failed callback never accepts or caches an unverified session", async () => {
    let loadedSession = false;
    let notified = false;
    await assert.rejects(
        exchangeSignInCallback(
            "https://sapo.example/?ott=expired",
            {
                crossDomain: {
                    oneTimeToken: {
                        verify: async () => ({
                            data: null,
                            error: { message: "expired" },
                        }),
                    },
                },
                getSession: async () => {
                    loadedSession = true;
                    return {};
                },
                updateSession: () => {
                    notified = true;
                },
            },
            () => undefined,
        ),
        /Sign-in could not be completed/,
    );
    assert.equal(loadedSession, false);
    assert.equal(notified, false);
});
