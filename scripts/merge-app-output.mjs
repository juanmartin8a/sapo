import { cp, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Combine the two framework builds into one Vercel Build Output API artifact.
// The site's routes/headers remain intact. Only /app reaches the Solid server.
export async function mergeAppOutput(siteUrl, appUrl) {
    const site = fileURLToPath(siteUrl);
    const app = fileURLToPath(appUrl);
    const config = JSON.parse(await readFile(join(site, "config.json"), "utf8"));
    const appConfig = JSON.parse(await readFile(join(app, "config.json"), "utf8"));
    if (config.version !== 3 || appConfig.version !== 3) {
        throw new Error("Expected Vercel Build Output API version 3.");
    }
    await access(join(app, "functions/__server.func/.vc-config.json"));
    await cp(join(app, "static/app"), join(site, "static/app"), { recursive: true });
    await cp(join(app, "functions/__server.func"), join(site, "functions/sapo-app.func"), { recursive: true });
    const routes = config.routes ?? [];
    const filesystemIndex = routes.findIndex((route) => route.handle === "filesystem");
    if (filesystemIndex < 0) throw new Error("The website output must include filesystem routing.");
    const beforeFiles = [
        { src: "^/app$", status: 308, headers: { Location: "/app/" } },
        { src: "^/app/(?:sw\\.js|manifest\\.webmanifest)$", headers: { "cache-control": "no-cache" }, continue: true },
    ];
    config.routes = [
        ...beforeFiles,
        ...routes.slice(0, filesystemIndex + 1),
        { src: "^/app/.*$", dest: "/sapo-app", headers: { "cache-control": "no-store" } },
        ...routes.slice(filesystemIndex + 1),
    ];
    await writeFile(join(site, "config.json"), JSON.stringify(config, null, 2) + "\n");
}
