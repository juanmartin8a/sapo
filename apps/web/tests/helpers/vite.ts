import { fileURLToPath } from "node:url";
import { createServer, type InlineConfig } from "vite";

export function createTestServer(config: InlineConfig) {
    return createServer({
        ...config,
        configFile: false,
        root: fileURLToPath(new URL("../..", import.meta.url)),
        server: { middlewareMode: true, watch: null, hmr: false, ws: false },
        // These tests load SSR modules only. Parallel servers must not optimize
        // browser dependencies into the same on-disk cache.
        optimizeDeps: { noDiscovery: true, include: [] },
    });
}
