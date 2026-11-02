import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { runInNewContext } from "node:vm";
import {
    parseSiteTheme,
    SITE_THEME_INIT_SCRIPT,
    SITE_THEME_STORAGE_KEY,
    watchPwaThemeColor,
    watchSiteTheme,
} from "../src/lib/site-theme.ts";

function mockGlobals(t: TestContext, environment: object) {
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(environment))) {
        const original = Object.getOwnPropertyDescriptor(globalThis, key);
        Object.defineProperty(globalThis, key, { ...descriptor, configurable: true });
        t.after(() => {
            if (original) Object.defineProperty(globalThis, key, original);
            else Reflect.deleteProperty(globalThis, key);
        });
    }
}

test("first-paint script restores the saved preference before hydration", () => {
    for (const preference of ["light", "dark", "system", null]) {
        const document = { documentElement: { dataset: {} as Record<string, string> } };
        runInNewContext(SITE_THEME_INIT_SCRIPT, {
            document,
            localStorage: {
                getItem(key: string) {
                    assert.equal(key, SITE_THEME_STORAGE_KEY);
                    return preference;
                },
            },
        });
        assert.equal(document.documentElement.dataset.siteTheme, preference ?? "system");
    }
});

test("blocked storage leaves the CSS system default available", () => {
    const document = { documentElement: { dataset: {} } };
    assert.doesNotThrow(() =>
        runInNewContext(SITE_THEME_INIT_SCRIPT, {
            document,
            get localStorage() {
                throw new Error("Storage blocked");
            },
        }),
    );
    assert.deepEqual(document.documentElement.dataset, {});
});

test("unknown appearance preferences fall back to system", () => {
    for (const value of [null, undefined, "invalid", {}, 1, "system"])
        assert.equal(parseSiteTheme(value), "system");
    assert.equal(parseSiteTheme("light"), "light");
    assert.equal(parseSiteTheme("dark"), "dark");
});

test("theme synchronization restores preferences, filters storage events, and cleans up", (t) => {
    const root = { dataset: { siteTheme: "system" } };
    const storage = {
        getItem(key: string) {
            assert.equal(key, SITE_THEME_STORAGE_KEY);
            return "dark";
        },
    };
    const window = new EventTarget();
    mockGlobals(t, {
        document: { documentElement: root },
        window,
        localStorage: storage,
    });
    const changes: string[] = [];
    const cleanup = watchSiteTheme((theme) => changes.push(theme));
    const dispatch = (key: string | null, newValue: string | null, storageArea = storage) =>
        window.dispatchEvent(Object.assign(new Event("storage"), { key, newValue, storageArea }));

    assert.equal(root.dataset.siteTheme, "dark");
    dispatch("unrelated", "light");
    dispatch(SITE_THEME_STORAGE_KEY, "light", { getItem: () => "light" });
    assert.deepEqual(changes, ["dark"]);
    dispatch(SITE_THEME_STORAGE_KEY, "light");
    assert.equal(root.dataset.siteTheme, "light");
    dispatch(SITE_THEME_STORAGE_KEY, "invalid");
    assert.equal(root.dataset.siteTheme, "system");
    dispatch(SITE_THEME_STORAGE_KEY, "dark");
    dispatch(null, null);
    assert.equal(root.dataset.siteTheme, "system");
    assert.deepEqual(changes, ["dark", "light", "system", "dark", "system"]);
    cleanup();
    dispatch(SITE_THEME_STORAGE_KEY, "dark");
    assert.equal(root.dataset.siteTheme, "system");
    assert.equal(changes.length, 5);
});

test("blocked storage preserves the current visit’s theme and ignores storage events", (t) => {
    const root = { dataset: { siteTheme: "dark" } };
    const window = new EventTarget();
    mockGlobals(t, {
        document: { documentElement: root },
        window,
        get localStorage() {
            throw new Error("Storage blocked");
        },
    });
    const changes: string[] = [];
    const cleanup = watchSiteTheme((theme) => changes.push(theme));
    window.dispatchEvent(
        Object.assign(new Event("storage"), {
            key: SITE_THEME_STORAGE_KEY,
            newValue: "light",
            storageArea: null,
        }),
    );
    assert.equal(root.dataset.siteTheme, "dark");
    assert.deepEqual(changes, ["dark"]);
    cleanup();
});

test("PWA chrome follows explicit and system appearance and cleans up its listeners", (t) => {
    const root = { dataset: { siteTheme: "system" } };
    const head = {};
    let color = "";
    let writes = 0;
    let onMutation = () => {};
    let onMediaChange = () => {};
    let disconnected = false;
    let removed = false;
    const media = {
        matches: true,
        addEventListener(name: string, listener: () => void) {
            assert.equal(name, "change");
            onMediaChange = listener;
        },
        removeEventListener(name: string, listener: () => void) {
            assert.equal(name, "change");
            assert.equal(listener, onMediaChange);
            removed = true;
        },
    };
    const environment = {
        document: {
            documentElement: root,
            head,
            querySelector(selector: string) {
                assert.equal(selector, 'meta[name="theme-color"]');
                return {
                    getAttribute(name: string) {
                        assert.equal(name, "content");
                        return color;
                    },
                    setAttribute(name: string, value: string) {
                        assert.equal(name, "content");
                        color = value;
                        writes++;
                    },
                };
            },
        },
        window: { matchMedia: () => media },
        MutationObserver: class {
            constructor(listener: () => void) {
                onMutation = listener;
            }
            observe(target: unknown, options: MutationObserverInit) {
                if (target === root) {
                    assert.deepEqual(options, {
                        attributes: true,
                        attributeFilter: ["data-site-theme"],
                    });
                } else {
                    assert.equal(target, head);
                    assert.deepEqual(options, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        attributeFilter: ["content"],
                    });
                }
            }
            disconnect() {
                disconnected = true;
            }
        },
    };
    mockGlobals(t, environment);
    const cleanup = watchPwaThemeColor();
    t.after(cleanup);
    assert.equal(color, "#101010");
    onMutation();
    assert.equal(writes, 1);
    color = "#ffffff";
    onMutation();
    assert.equal(color, "#101010");
    assert.equal(writes, 2);
    root.dataset.siteTheme = "light";
    onMutation();
    assert.equal(color, "#ffffff");
    root.dataset.siteTheme = "dark";
    media.matches = false;
    onMediaChange();
    assert.equal(color, "#101010");
    root.dataset.siteTheme = "system";
    onMutation();
    assert.equal(color, "#ffffff");
    media.matches = true;
    onMediaChange();
    assert.equal(color, "#101010");
    cleanup();
    assert.equal(disconnected, true);
    assert.equal(removed, true);
});
