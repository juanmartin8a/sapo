import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { createTursoReader, DatabaseCapacityError } from "./turso-client.ts";
import { databaseResponse } from "./database-response.ts";

test("overload is rejected before SDK queuing, and failed reads release capacity", async () => {
    const requests: Array<() => void> = [];
    let failing = true;
    const fetchFn: typeof fetch = async (input, options) => {
        assert.equal(options?.redirect, "error");
        assert.ok(options?.signal);
        if (failing) {
            await new Promise<void>((resolve) => {
                requests.push(resolve);
            });
            throw new Error("simulated upstream outage");
        }
        const request = input as Request;
        const body = (await request.json()) as { requests: Array<{ type: string }> };
        return Response.json({
            baton: null,
            base_url: null,
            results: body.requests.map(({ type }) => ({
                type: "ok",
                response:
                    type === "execute"
                        ? {
                              type,
                              result: {
                                  cols: [],
                                  rows: [],
                                  affected_row_count: 0,
                                  last_insert_rowid: null,
                              },
                          }
                        : { type },
            })),
        });
    };
    const db = createTursoReader("libsql://example.invalid", "test-token", fetchFn);
    const pending = Promise.allSettled(Array.from({ length: 20 }, () => db.execute("SELECT 1")));
    await setImmediate();
    assert.equal(requests.length, 20);
    await assert.rejects(db.execute("SELECT 1"), DatabaseCapacityError);
    const overload = await databaseResponse(() => db.execute("SELECT 1"), 300);
    assert.equal(overload.status, 503);
    assert.equal(overload.headers.get("Cache-Control"), "no-store");
    assert.equal(overload.headers.get("Retry-After"), "1");
    assert.equal(requests.length, 20);
    requests.forEach((release) => release());
    assert.ok((await pending).every(({ status }) => status === "rejected"));
    failing = false;
    assert.deepEqual((await db.execute("SELECT ?", [1])).rows, []);
    await Promise.all(Array.from({ length: 20 }, () => db.execute("SELECT 1")));
});

test("the server deadline aborts a stalled SDK response body", async () => {
    // AbortSignal.timeout uses an unreferenced native timer. Keep the test process
    // alive until the real 8-second deadline fires, without making a network call.
    const keepAlive = setTimeout(() => {}, 10_000);
    let timedOut = false;
    try {
        const db = createTursoReader(
            "https://example.invalid",
            "test-token",
            async (_input, options) =>
                new Response(
                    new ReadableStream({
                        start(stream) {
                            options!.signal!.addEventListener(
                                "abort",
                                () => {
                                    timedOut = options!.signal!.reason?.name === "TimeoutError";
                                    stream.error(options!.signal!.reason);
                                },
                                { once: true },
                            );
                        },
                    }),
                ),
        );
        await assert.rejects(db.execute("SELECT 1"));
        assert.equal(timedOut, true);
    } finally {
        clearTimeout(keepAlive);
    }
});
