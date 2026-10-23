import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

test("the installed Start graph contains patched server cores and one shared runtime", () => {
    const visited = new Set<string>();
    const packages = new Map<string, Set<string>>();

    function visit(path: string) {
        if (visited.has(path)) return;
        visited.add(path);
        const pkg = JSON.parse(readFileSync(path, "utf8")) as {
            name: string;
            version: string;
            dependencies?: Record<string, string>;
        };
        if (!packages.has(pkg.name)) packages.set(pkg.name, new Set());
        packages.get(pkg.name)!.add(path);
        if (pkg.name === "@tanstack/start-server-core") {
            const version = pkg.version.match(/^(\d+)\.(\d+)\.(\d+)$/);
            assert.ok(version, `Unverified server core release: ${pkg.version}`);
            const [major, minor, patch] = version.slice(1).map(Number);
            assert.ok(
                major > 1 || (major === 1 && (minor > 169 || (minor === 169 && patch >= 39))),
                `CVE-2026-102989: vulnerable server core ${pkg.version} at ${path}`,
            );
        }
        const require = createRequire(path);
        for (const name of Object.keys(pkg.dependencies ?? {})) {
            if (name.startsWith("@tanstack/")) visit(require.resolve(`${name}/package.json`));
        }
    }

    const require = createRequire(import.meta.url);
    visit(require.resolve("@tanstack/solid-start/package.json"));
    for (const name of [
        "@tanstack/start-server-core",
        "@tanstack/start-client-core",
        "@tanstack/start-storage-context",
        "@tanstack/router-core",
        "@tanstack/history",
    ]) {
        assert.equal(packages.get(name)?.size, 1, `Split or missing runtime: ${name}`);
    }
});
