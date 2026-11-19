import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test, type TestContext } from "node:test";
import { createFrogTransitions, waitForFrogImages } from "./frogTransition.ts";

function frogImage(decode: () => Promise<void>, visible = true) {
    return { loading: "lazy", getClientRects: () => ({ length: Number(visible) }), decode };
}

function mockFrogImages(t: TestContext, ...images: ReturnType<typeof frogImage>[]) {
    Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: { querySelectorAll: () => images },
    });
    t.after(() => {
        Reflect.deleteProperty(globalThis, "document");
    });
}

test("only the displayed frog theme is decoded before the intro", async (t) => {
    const decodeVisible = t.mock.fn(async () => {});
    const decodeHidden = t.mock.fn(async () => {});
    const visible = frogImage(decodeVisible);
    const hidden = frogImage(decodeHidden, false);
    mockFrogImages(t, visible, hidden);
    assert.equal(await waitForFrogImages(), true);
    assert.equal(visible.loading, "eager");
    assert.equal(decodeVisible.mock.callCount(), 1);
    assert.equal(hidden.loading, "lazy");
    assert.equal(decodeHidden.mock.callCount(), 0);
});

test("a stalled image stops holding up the frog intro and navigation", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    mockFrogImages(
        t,
        frogImage(() => new Promise(() => {})),
    );
    const ready = waitForFrogImages();
    t.mock.timers.runAll();
    assert.equal(await ready, false);
});

test("a failed frog image skips the intro", async (t) => {
    mockFrogImages(
        t,
        frogImage(() => Promise.reject(new Error("Image failed to decode"))),
    );
    assert.equal(await waitForFrogImages(), false);
});

test("mouth animation waits until navigation finishes", async () => {
    const { begin: beginFrogTransition, wait: waitForFrogTransition } = createFrogTransitions();
    const finish = beginFrogTransition();
    let ready = false;
    const waiting = waitForFrogTransition().then(() => {
        ready = true;
    });
    await setImmediate();
    assert.equal(ready, false);
    finish();
    await waiting;
    assert.equal(ready, true);
});

test("an interrupted transition cannot release animation during the next navigation", async () => {
    const { begin: beginFrogTransition, wait: waitForFrogTransition } = createFrogTransitions();
    const finishFirst = beginFrogTransition();
    let ready = false;
    const waiting = waitForFrogTransition().then(() => {
        ready = true;
    });
    const finishSecond = beginFrogTransition();
    finishFirst();
    await setImmediate();
    assert.equal(ready, false);
    finishSecond();
    await waiting;
    assert.equal(ready, true);
});

test("animation can start immediately when no transition is pending", async () => {
    const { wait: waitForFrogTransition } = createFrogTransitions();
    await waitForFrogTransition();
});
