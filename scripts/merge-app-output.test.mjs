import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { mergeAppOutput } from "./merge-app-output.mjs";

test("one deployment preserves website headers, APIs, and static files while routing only /app to Solid", async () => {
    const root = await mkdtemp(join(tmpdir(), "sapo-output-"));
    try {
        const site = join(root, "site");
        const app = join(root, "app");
        await mkdir(join(site, "static/.well-known"), { recursive: true });
        await mkdir(join(site, "functions/site.func"), { recursive: true });
        await mkdir(join(app, "static/app"), { recursive: true });
        await mkdir(join(app, "functions/__server.func"), { recursive: true });
        const headers = { src: "/.well-known/apple-app-site-association", headers: { "content-type": "application/json" }, continue: true };
        const api = { src: "/api/(.*)", dest: "/site" };
        await writeFile(join(site, "config.json"), JSON.stringify({ version: 3, routes: [headers, { handle: "filesystem" }, api, { src: "/(.*)", dest: "/site" }] }));
        await writeFile(join(site, "static/index.html"), "website");
        await writeFile(join(site, "static/.well-known/apple-app-site-association"), "association");
        await writeFile(join(app, "config.json"), JSON.stringify({ version: 3 }));
        await writeFile(join(app, "static/app/sw.js"), "worker");
        await writeFile(join(app, "functions/__server.func/.vc-config.json"), '{"runtime":"nodejs24.x"}');
        await writeFile(join(app, "functions/__server.func/index.mjs"), "server");
        await mergeAppOutput(pathToFileURL(site + "/"), pathToFileURL(app + "/"));
        const config = JSON.parse(await readFile(join(site, "config.json"), "utf8"));
        const fileIndex = config.routes.findIndex((route) => route.handle === "filesystem");
        assert.deepEqual(config.routes[fileIndex - 1], headers);
        const appRoute = config.routes[fileIndex + 1];
        assert.equal(appRoute.dest, "/sapo-app");
        assert.equal(appRoute.headers["cache-control"], "no-store");
        const regex = new RegExp(appRoute.src);
        for (const path of ["/app/", "/app/settings", "/app/api/stripe/webhook"]) assert.equal(regex.test(path), true);
        for (const path of ["/", "/support/", "/api/languages", "/apple"]) assert.equal(regex.test(path), false);
        assert.deepEqual(config.routes[fileIndex + 2], api);
        assert.equal(await readFile(join(site, "static/index.html"), "utf8"), "website");
        assert.equal(await readFile(join(site, "static/.well-known/apple-app-site-association"), "utf8"), "association");
        assert.equal(await readFile(join(site, "static/app/sw.js"), "utf8"), "worker");
        assert.equal(await readFile(join(site, "functions/sapo-app.func/index.mjs"), "utf8"), "server");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
