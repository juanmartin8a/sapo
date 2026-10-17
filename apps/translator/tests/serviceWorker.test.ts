import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

test("the worker never intercepts API, cross-origin, or mutation requests", () => {
    const listeners = new Map<string, (event: unknown) => void>();
    runInNewContext(
        readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"),
        {
            self: {
                location: { origin: "https://sapo.example" },
                addEventListener: (
                    name: string,
                    listener: (event: unknown) => void,
                ) => listeners.set(name, listener),
            },
            URL,
        },
    );
    for (const request of [
        { method: "GET", url: "https://sapo.example/", mode: "navigate" },
        { method: "GET", url: "https://sapo.example/support/", mode: "navigate" },
        { method: "GET", url: "https://sapo.example/api/languages" },
        { method: "GET", url: "https://sapo.example/app/api/auth/get-session" },
        { method: "POST", url: "https://sapo.example/app/api/stripe/webhook" },
        {
            method: "GET",
            url: "https://backend.convex.site/api/auth/get-session",
        },
        { method: "POST", url: "https://backend.convex.site/sapopinguino" },
    ]) {
        let intercepted = false;
        listeners.get("fetch")!({
            request,
            respondWith: () => {
                intercepted = true;
            },
        });
        assert.equal(intercepted, false, request.url);
    }
});

test("offline navigation uses the static notice and never caches user pages", async () => {
    const listeners = new Map<string, (event: unknown) => void>();
    const cacheReads: string[] = [];
    let response: Promise<unknown> | undefined;
    runInNewContext(
        readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"),
        {
            self: {
                location: { origin: "https://sapo.example" },
                addEventListener: (
                    name: string,
                    listener: (event: unknown) => void,
                ) => listeners.set(name, listener),
            },
            URL,
            fetch: async () => {
                throw new Error("offline");
            },
            caches: {
                match: async (url: string) => {
                    cacheReads.push(url);
                    return "offline notice";
                },
            },
        },
    );
    listeners.get("fetch")!({
        request: {
            method: "GET",
            url: "https://sapo.example/app/settings",
            mode: "navigate",
        },
        respondWith: (value: Promise<unknown>) => {
            response = value;
        },
    });
    assert.equal(await response, "offline notice");
    assert.deepEqual(cacheReads, ["/app/offline.html"]);
});
