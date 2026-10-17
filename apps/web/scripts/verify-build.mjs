import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const fixture = JSON.parse(
    await readFile(new URL("tests/fixtures/site-content.json", root), "utf8"),
);
const hash = (value) => createHash("sha256").update(value).digest("hex");

export function pageText(html) {
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html;
    const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    return main
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) =>
            entity.startsWith("#")
                ? String.fromCodePoint(
                      parseInt(
                          entity.slice(entity[1] === "x" ? 2 : 1),
                          entity[1] === "x" ? 16 : 10,
                      ),
                  )
                : entities[entity],
        )
        .replace(/\s+/g, " ")
        .trim();
}

for (const [path, expected] of Object.entries(fixture.pages)) {
    const html = await readFile(new URL(`.vercel/output/static/${path}`, root), "utf8");
    assert.equal(hash(pageText(html)), expected, `Page wording changed: ${path}`);
    assert.ok(/<html\b[^>]*\blang="en"/.test(html), `Missing document language: ${path}`);
    const metadata = fixture.metadata[path];
    assert.equal(
        pageText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""),
        metadata.title,
        `Page title changed: ${path}`,
    );
    if (metadata.description) {
        const tag = html.match(/<meta\b[^>]*name="description"[^>]*>/i)?.[0] ?? "";
        assert.equal(
            pageText(tag.match(/content="([^"]*)"/)?.[1] ?? ""),
            metadata.description,
            `Description changed: ${path}`,
        );
    }
    assert.ok(!html.includes('rel="manifest"'), `Public page includes the app manifest: ${path}`);
    console.log(`Preserved page wording: ${path}`);
}
for (const [path, expected] of Object.entries(fixture.assets)) {
    const content = await readFile(new URL(`.vercel/output/static/${path}`, root));
    assert.equal(hash(content), expected, `Public asset changed: ${path}`);
}
const manifest = JSON.parse(
    await readFile(new URL(".vercel/output/static/app/manifest.webmanifest", root), "utf8"),
);
assert.equal(manifest.scope, "/app/");
assert.equal(manifest.start_url, "/app/");
const config = JSON.parse(await readFile(new URL(".vercel/output/config.json", root), "utf8"));
const rules = JSON.stringify(config.routes);
assert.ok(rules.includes("application/json"), "Missing Apple association response header");
assert.ok(rules.includes("no-cache"), "Missing PWA update cache policy");
assert.ok(rules.includes("no-store"), "Missing translator cache policy");

// Follow the subset of Vercel's routing model used by this build. Header-only
// routes are terminal unless continue=true; a local Nitro preview skips this layer.
async function deploymentTarget(path) {
    let target = path;
    for (const route of config.routes) {
        if (route.handle === "filesystem") {
            for (const candidate of [target, `${target.replace(/\/$/, "")}/index.html`]) {
                const file = new URL(`.vercel/output/static/${candidate.replace(/^\//, "")}`, root);
                if (
                    await stat(file).then(
                        (entry) => entry.isFile(),
                        () => false,
                    )
                )
                    return candidate;
            }
            continue;
        }
        if (!route.src || !new RegExp(`^${route.src}$`).test(target)) continue;
        if (route.status) return route.headers?.Location ?? target;
        target = route.dest ?? target;
        if (!route.continue) return target;
    }
    return target;
}
for (const path of [
    "/app/",
    "/app/auth/",
    "/app/settings/",
    "/app/delete-account",
    "/app/api/stripe/webhook",
    "/api/languages",
    "/api/pronunciations",
]) {
    assert.equal(
        await deploymentTarget(path),
        "/__server",
        `Server route is shadowed by deployment headers: ${path}`,
    );
}
assert.equal(await deploymentTarget("/app"), "/app/");
for (const path of [
    "/app/sw.js",
    "/app/manifest.webmanifest",
    "/app/images/sapo.png",
    "/.well-known/apple-app-site-association",
]) {
    assert.equal(await deploymentTarget(path), path, `Static route is shadowed: ${path}`);
}
const server = JSON.parse(
    await readFile(new URL(".vercel/output/functions/__server.func/.vc-config.json", root), "utf8"),
);
assert.equal(server.runtime, "nodejs24.x");

// Exercise the emitted server without credentials or external network requests.
const { default: handler } = await import(
    new URL(".vercel/output/functions/__server.func/index.mjs", root).href
);
for (const [path, home] of [
    ["/app/review-missing-page/", "/app/"],
    ["/review-missing-page/", "/"],
]) {
    const response = await handler.fetch(new Request(`https://sapo.example${path}`));
    assert.equal(response.status, 404);
    const html = await response.text();
    assert.equal(
        html.match(/<a\b[^>]*href="([^"]*)"/)?.[1],
        home,
        `404 escapes its route namespace: ${path}`,
    );
}
const invalid = await handler.fetch(
    new Request("https://sapo.example/api/pronunciations?source=en&target=es&cursor=invalid"),
);
assert.equal(invalid.status, 400);
assert.equal(invalid.headers.get("cache-control"), "no-store");
await invalid.arrayBuffer();
const app = await handler.fetch(new Request("https://sapo.example/app/"));
assert.equal(app.status, 200);
assert.equal(app.headers.get("cache-control"), "no-store");
assert.ok((await app.text()).includes('id="translation-input"'));
console.log("Verified static assets, PWA scope, deployment headers, and Node 24 runtime.");
