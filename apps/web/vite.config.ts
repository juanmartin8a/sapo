import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/solid-start/plugin/vite";
import solid from "@solidjs/vite-plugin";
import { nitro } from "nitro/vite";

export default defineConfig(({ mode }) => {
    // Vite exposes only VITE_* to the client; private local settings are for SSR.
    for (const [key, value] of Object.entries(
        loadEnv(mode, process.cwd(), ["TURSO_", "STRIPE_"]),
    )) {
        process.env[key] ??= value;
    }
    return {
        plugins: [
            tanstackStart({
                prerender: {
                    enabled: true,
                    autoSubfolderIndex: true,
                    crawlLinks: false,
                    filter: ({ path }) =>
                        path === "/" ||
                        (!/^\/(?:app|pwa)(?:\/|$)/.test(path) && !path.startsWith("/api/")),
                    failOnError: true,
                },
            }),
            solid({ ssr: true }),
            nitro({
                vercel: { functions: { runtime: "nodejs24.x" } },
                modules: [
                    (nitro) => {
                        if (nitro.options.preset !== "vercel") return;
                        nitro.hooks.hook("compiled", async () => {
                            const path = join(nitro.options.output.dir, "config.json");
                            const config = JSON.parse(await readFile(path, "utf8"));
                            const translatorHeaders = config.routes.filter(
                                (route: { src?: string }) =>
                                    route.src === "/app/(.*)" || route.src === "/pwa/(.*)",
                            );
                            // Nitro 3 emits a terminal header rule. Dynamic app paths
                            // must continue through the filesystem to the server fallback.
                            for (const route of translatorHeaders) route.continue = true;
                            await writeFile(path, JSON.stringify(config, null, 2) + "\n");
                        });
                    },
                ],
                routeRules: {
                    "/.well-known/apple-app-site-association": {
                        headers: { "content-type": "application/json" },
                    },
                    "/app": { redirect: { to: "/app/", status: 308 } },
                    "/app/**": { headers: { "cache-control": "no-store" } },
                    "/pwa": { redirect: { to: "/pwa/", status: 308 } },
                    "/pwa/**": { headers: { "cache-control": "no-store" } },
                    "/app/sw.js": { headers: { "cache-control": "no-cache" } },
                    "/pwa/sw.js": { headers: { "cache-control": "no-cache" } },
                    "/pwa/manifest.webmanifest": { headers: { "cache-control": "no-cache" } },
                },
            }),
        ],
        resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
        preview: { port: 4173, strictPort: false },
        server: { host: "127.0.0.1", port: 3000, strictPort: true },
    };
});
