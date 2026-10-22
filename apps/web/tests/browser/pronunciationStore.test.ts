import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { createRoot, createSignal, flush } from "solid-js";
import { createPronunciationStore } from "../../src/stores/pronunciationStore.ts";
import type { Pronunciation } from "../../src/lib/pronunciations.ts";

const row = (id: string): Pronunciation => ({
    id,
    orthographic_form: id,
    source_language_code: "en",
    target_language_code: "es",
    ipa: "/test/",
    respelling: "test",
});
const settle = async () => {
    flush();
    await setImmediate();
    flush();
};

test("browser pagination follows cursors, preserves row offsets, and can go back", async (context) => {
    const requests: URL[] = [];
    context.mock.method(globalThis, "fetch", async (input: string) => {
        const url = new URL(input, "https://sapo.example");
        requests.push(url);
        if (url.pathname === "/api/languages") return Response.json([]);
        return Response.json(
            url.searchParams.has("cursor")
                ? { page: [row("second")], nextCursor: null }
                : {
                      page: Array.from({ length: 25 }, (_, index) => row(`first-${index}`)),
                      nextCursor: "next-page",
                  },
        );
    });
    let dispose!: () => void;
    const browser = createRoot((cleanup) => {
        dispose = cleanup;
        return createPronunciationStore(() => ({ source: "en", target: "es" }));
    });
    try {
        await settle();
        assert.equal(browser.state.rows.length, 25);
        assert.equal(browser.state.isDone, false);
        await browser.loadPage(1);
        await settle();
        assert.equal(requests.at(-1)?.searchParams.get("cursor"), "next-page");
        assert.equal(browser.state.rows[0].id, "second");
        assert.equal(browser.state.rowOffset, 25);
        assert.equal(browser.state.pageIndex, 1);
        assert.equal(browser.state.isDone, true);
        await browser.loadPage(0);
        await settle();
        assert.equal(browser.state.rowOffset, 0);
        assert.equal(browser.state.pageIndex, 0);
        assert.equal(browser.state.rows[0].id, "first-0");
    } finally {
        dispose();
    }
});

test("a late response from an old language pair cannot replace current results", async (context) => {
    let finishOld!: (response: Response) => void;
    let oldSignal: AbortSignal | undefined;
    context.mock.method(globalThis, "fetch", async (input: string, options: RequestInit) => {
        const url = new URL(input, "https://sapo.example");
        if (url.pathname === "/api/languages") return Response.json([]);
        if (url.searchParams.get("source") === "en") {
            oldSignal = options.signal ?? undefined;
            return new Promise<Response>((resolve) => {
                finishOld = resolve;
            });
        }
        return Response.json({ page: [row("current")], nextCursor: null });
    });
    let dispose!: () => void;
    const [pair, setPair] = createSignal({ source: "en", target: "es" });
    const browser = createRoot((cleanup) => {
        dispose = cleanup;
        return createPronunciationStore(pair);
    });
    try {
        await settle();
        assert.equal(browser.state.resultsStatus, "loading");
        setPair({ source: "fr", target: "en" });
        await settle();
        assert.equal(oldSignal?.aborted, true);
        assert.equal(browser.state.rows[0].id, "current");
        finishOld(Response.json({ page: [row("stale")], nextCursor: "stale-cursor" }));
        await settle();
        assert.equal(browser.state.rows[0].id, "current");
        assert.equal(browser.state.isDone, true);
        assert.equal(browser.state.pageIndex, 0);
    } finally {
        dispose();
    }
});

test("a failed page can be retried without losing the requested cursor", async (context) => {
    let attempts = 0;
    const cursors: (string | null)[] = [];
    context.mock.method(globalThis, "fetch", async (input: string) => {
        if (input === "/api/languages") return Response.json([]);
        const cursor = new URL(input, "https://sapo.example").searchParams.get("cursor");
        if (!cursor) {
            return Response.json({
                page: Array.from({ length: 25 }, (_, index) => row(`first-${index}`)),
                nextCursor: "next-page",
            });
        }
        cursors.push(cursor);
        attempts++;
        return attempts === 1
            ? new Response("unavailable", { status: 503 })
            : Response.json({ page: [row("recovered")], nextCursor: null });
    });
    let dispose!: () => void;
    const browser = createRoot((cleanup) => {
        dispose = cleanup;
        return createPronunciationStore(() => ({ source: "en", target: "es" }));
    });
    try {
        await settle();
        await browser.loadPage(1);
        await settle();
        assert.equal(browser.state.resultsStatus, "error");
        await browser.retry();
        await settle();
        assert.equal(browser.state.resultsStatus, "ready");
        assert.equal(browser.state.rows[0].id, "recovered");
        assert.equal(browser.state.pageIndex, 1);
        assert.equal(browser.state.rowOffset, 25);
        assert.deepEqual(cursors, ["next-page", "next-page"]);
    } finally {
        dispose();
    }
});
