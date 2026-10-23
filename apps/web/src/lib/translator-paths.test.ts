import assert from "node:assert/strict";
import { test } from "node:test";
import { deleteAccountPath, isTranslatorPath, translatorBase } from "./translator-paths.ts";

test("only translator pages and legacy app namespaces receive personalized HTML", () => {
    for (const path of [
        "/",
        "/auth",
        "/auth/",
        "/auth-callback/",
        "/settings/",
        "/account/delete-account/",
        "/app",
        "/app/auth/",
        "/pwa",
        "/pwa/settings/",
    ])
        assert.equal(isTranslatorPath(path), true, path);

    for (const path of [
        "/about/",
        "/support/",
        "/delete-account/",
        "/privacy-policy/",
        "/multilingual-phonetic-representations/",
        "/multilingual-phonetic-representations/about/",
        "/api/languages",
        "/author/",
        "/pwa-other/",
        "/application/",
    ])
        assert.equal(isTranslatorPath(path), false, path);
});

test("web and PWA destinations stay separate without shadowing public deletion help", () => {
    for (const path of ["/", "/about/", "/app/", "/settings/", "/pwa-other/"])
        assert.equal(translatorBase(path), "", path);
    for (const path of ["/pwa", "/pwa/", "/pwa/settings/"])
        assert.equal(translatorBase(path), "/pwa", path);
    assert.equal(deleteAccountPath(""), "/account/delete-account");
    assert.equal(deleteAccountPath("/pwa"), "/pwa/delete-account");
});
