import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { iconAssetNames } from "../src/constants/icons.ts";

const root = new URL("../", import.meta.url);
const fixture = JSON.parse(
    await readFile(new URL("tests/fixtures/site-content.json", root), "utf8"),
);
const hash = (value) => createHash("sha256").update(value).digest("hex");

function hasTranslatorStyles(html) {
    return [...html.matchAll(/<link\b[^>]*>/g)].some(
        ([tag]) =>
            tag.includes('rel="stylesheet"') && /href="[^"]*\/translator-[^"]+\.css"/.test(tag),
    );
}

function pageText(html) {
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
    assert.equal(hasTranslatorStyles(html), false, `Public page loads translator CSS: ${path}`);
    console.log(`Preserved page wording: ${path}`);
}
for (const [path, expected] of Object.entries(fixture.assets)) {
    const content = await readFile(new URL(`.vercel/output/static/${path}`, root));
    assert.equal(hash(content), expected, `Public asset changed: ${path}`);
}
for (const name of iconAssetNames) {
    const icon = await stat(new URL(`.vercel/output/static/app/icons/${name}.svg`, root));
    assert.ok(icon.isFile() && icon.size > 0, `Missing deployed icon: ${name}`);
}
const manifest = JSON.parse(
    await readFile(new URL(".vercel/output/static/pwa/manifest.webmanifest", root), "utf8"),
);
assert.equal(manifest.id, "/pwa/");
assert.equal(manifest.scope, "/pwa/");
assert.equal(manifest.start_url, "/pwa/");
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
    "/pwa/",
    "/pwa/auth/",
    "/pwa/auth-callback/",
    "/pwa/settings/",
    "/pwa/delete-account/",
    "/app/",
    "/app/auth/",
    "/app/auth-callback/",
    "/app/api/auth/get-session",
    "/app/api/auth/convex/token",
    "/app/api/auth/sign-out",
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
assert.equal(await deploymentTarget("/pwa"), "/pwa/");
for (const path of [
    "/app/sw.js",
    "/pwa/sw.js",
    "/pwa/manifest.webmanifest",
    "/pwa/offline.html",
    "/pwa/icons/app-192.png",
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
    ["/pwa/review-missing-page/", "/pwa/"],
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
const billing = await handler.fetch(
    new Request("https://sapo.example/app/api/stripe/webhook", { method: "POST" }),
);
assert.equal(billing.status, 503);
assert.equal(billing.headers.get("cache-control"), "no-store");
assert.deepEqual(await billing.json(), { error: "Billing is not enabled." });
for (const basePath of ["/app", "/pwa"]) {
    for (const path of ["/", "/auth/", "/settings/", "/delete-account/"]) {
        const response = await handler.fetch(new Request(`https://sapo.example${basePath}${path}`));
        assert.equal(response.status, 200, `${basePath}${path}`);
        assert.match(response.headers.get("cache-control"), /no-store/);
        const html = await response.text();
        assert.equal(hasTranslatorStyles(html), true, `Missing translator CSS: ${basePath}${path}`);
        assert.equal(html.includes('rel="manifest"'), basePath === "/pwa", `${basePath}${path}`);
        assert.equal(html.includes('name="apple-mobile-web-app-capable"'), basePath === "/pwa");
        assert.ok(html.includes(basePath === "/pwa" ? "translator-pwa" : "translator-web"));
        assert.equal(
            /<header\b[^>]*class="[^"]*\bsite-header\b/.test(html),
            basePath === "/app",
            `Wrong website header on ${basePath}${path}`,
        );
        assert.equal(
            /<footer\b[^>]*class="[^"]*\bsite-footer\b/.test(html),
            basePath === "/app",
            `Wrong website footer on ${basePath}${path}`,
        );
        if (path === "/") {
            assert.ok(html.includes('id="translation-input"'));
            assert.equal(
                /<header\b[^>]*class="[^"]*\bapp-header\b/.test(html),
                basePath === "/pwa",
            );
            assert.equal(html.includes('aria-label="Workspace view"'), basePath === "/pwa");
        }
        if (basePath === "/pwa") {
            assert.ok(html.includes("/pwa/manifest.webmanifest"));
            assert.ok(
                !/href="\/app\/(?:auth|settings)\//.test(html),
                "PWA account links escape their namespace",
            );
        }
    }
}
console.log("Verified static assets, PWA scope, deployment headers, and Node 24 runtime.");
