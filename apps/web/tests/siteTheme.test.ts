import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import {
    parseSiteTheme,
    SITE_THEME_INIT_SCRIPT,
    SITE_THEME_STORAGE_KEY,
} from "../src/lib/site-theme.ts";

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
