import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { fetchData } from "./fetchData.ts";

test("JSON fetching works without newer AbortSignal helpers and cleans up its listener", async (t) => {
    t.mock.method(AbortSignal, "any", () => {
        throw new Error("Unsupported browser API");
    });
    t.mock.method(AbortSignal, "timeout", () => {
        throw new Error("Unsupported browser API");
    });
    const controller = new AbortController();
    const removed = t.mock.method(controller.signal, "removeEventListener");
    const result = await fetchData<{ ok: boolean }>("/api/languages", controller.signal, async () =>
        Response.json({ ok: true }),
    );
    assert.deepEqual(result, { ok: true });
    assert.equal(removed.mock.callCount(), 1);
});

const abortingFetch: typeof fetch = async (_input, options) =>
    new Promise((_resolve, reject) => {
        const signal = options!.signal!;
        if (signal.aborted) reject(signal.reason);
        else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });

test("filter cancellation and already-cancelled requests propagate to fetch", async () => {
    const controller = new AbortController();
    const pending = fetchData("/api/languages", controller.signal, abortingFetch);
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    await assert.rejects(fetchData("/api/languages", controller.signal, abortingFetch), {
        name: "AbortError",
    });
});

test("the browser deadline also aborts a stalled response body", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const controller = new AbortController();
    let reading: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
        reading = resolve;
    });
    const fetchFn: typeof fetch = async (_input, options) =>
        new Response(
            new ReadableStream({
                start(stream) {
                    options!.signal!.addEventListener(
                        "abort",
                        () => stream.error(options!.signal!.reason),
                        {
                            once: true,
                        },
                    );
                    reading!();
                },
            }),
        );
    const pending = fetchData("/api/languages", controller.signal, fetchFn);
    await started;
    t.mock.timers.tick(15_000);
    await assert.rejects(pending, { name: "TimeoutError" });
});

test("non-success status and invalid JSON fail without leaking upstream messages", async () => {
    const signal = new AbortController().signal;
    await assert.rejects(
        fetchData(
            "/api/languages",
            signal,
            async () => new Response("secret upstream error", { status: 503 }),
        ),
        { message: "Database request failed." },
    );
    await assert.rejects(
        fetchData("/api/languages", signal, async () => new Response("invalid JSON")),
        SyntaxError,
    );
});

test("HTTP errors cancel unfinished response bodies and release their connection", async () => {
    let disconnected: Promise<unknown> | undefined;
    const server = createServer((_request, response) => {
        disconnected = once(response, "close", { signal: AbortSignal.timeout(2_000) });
        response.writeHead(503, { "Content-Type": "text/plain" });
        response.write("upstream error");
        // Deliberately leave the body unfinished.
    });
    try {
        server.listen(0, "127.0.0.1");
        await once(server, "listening");
        const address = server.address();
        assert.ok(address && typeof address !== "string");
        await assert.rejects(
            fetchData(`http://127.0.0.1:${address.port}`, new AbortController().signal),
            { message: "Database request failed." },
        );
        assert.ok(disconnected);
        await disconnected;
    } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
});
