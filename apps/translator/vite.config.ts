import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/solid-start/plugin/vite";
import solid from "@solidjs/vite-plugin";
import { nitro } from "nitro/vite";

export default defineConfig({
    base: "/app/",
    plugins: [
        tanstackStart({ router: { basepath: "/app" } }),
        solid({ ssr: true }),
        nitro({ baseURL: "/app/", vercel: { functions: { runtime: "nodejs24.x" } } }),
    ],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    server: {
        port: 3001,
        strictPort: true,
        hmr: { path: "/app/hmr" },
    },
});
