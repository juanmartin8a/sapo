import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { iconAssetNames } from "../src/constants/icons.ts";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const sharedAssets = fileURLToPath(new URL("../../mobile/assets/", import.meta.url));
await mkdir(join(appRoot, "public/app/images"), { recursive: true });
await mkdir(join(appRoot, "public/app/icons"), { recursive: true });
for (const file of [
    "sapo-frog.svg",
    "sapo-frog-open.svg",
    "sapo-frog-dark.svg",
    "sapo-frog-open-dark.svg",
]) {
    await cp(join(appRoot, "public", file), join(appRoot, "public/app/images", file));
}
for (const file of ["sapo-dark.png", "sapo-mouth-open-dark.png"]) {
    await cp(join(sharedAssets, "images", file), join(appRoot, "public/app/images", file));
}
const icons = iconAssetNames.map((name) => `${name}.svg`);
// The web Apple buttons use standalone SVGs with their own backgrounds.
const webIcons = new Set(["apple-logo.svg", "apple-logo-dark.svg"]);
const iconDirectory = join(appRoot, "public/app/icons");
for (const file of await readdir(iconDirectory)) {
    if (file.endsWith(".svg") && !icons.includes(file)) await rm(join(iconDirectory, file));
}
for (const file of icons) {
    if (!webIcons.has(file)) {
        await cp(join(sharedAssets, "icons", file), join(iconDirectory, file));
    }
}
