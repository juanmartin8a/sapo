import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mergeAppOutput } from "./merge-app-output.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const result = spawnSync("bun", ["run", "--filter", "@sapo/translator", "build:vercel"], {
    cwd: root,
    stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
await mergeAppOutput(
    new URL("../apps/web/.vercel/output/", import.meta.url),
    new URL("../apps/translator/.vercel/output/", import.meta.url),
);
console.log("Website and /app are ready in apps/web/.vercel/output.");
