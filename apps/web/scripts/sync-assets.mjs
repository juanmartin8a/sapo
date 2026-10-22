import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { iconAssetNames } from "../src/constants/icons.ts";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const sharedAssets = fileURLToPath(new URL("../../mobile/assets/", import.meta.url));
await mkdir(join(appRoot, "public/app/images"), { recursive: true });
await mkdir(join(appRoot, "public/app/icons"), { recursive: true });
for (const file of ["sapo.png", "sapo-mouth-open.png"]) {
    await cp(join(sharedAssets, "images", file), join(appRoot, "public/app/images", file));
}
// Copy only icons used by the web UI; keep native-only assets out of the build.
const icons = iconAssetNames.map((name) => `${name}.svg`);
const iconDirectory = join(appRoot, "public/app/icons");
for (const file of await readdir(iconDirectory)) {
    if (file.endsWith(".svg") && !icons.includes(file)) await rm(join(iconDirectory, file));
}
for (const file of icons) {
    await cp(join(sharedAssets, "icons", file), join(iconDirectory, file));
}
