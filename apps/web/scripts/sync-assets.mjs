import { cp, mkdir } from "node:fs/promises";
import { iconAssetNames } from "../src/constants/icons.ts";

const publicAssets = new URL("../public/app/", import.meta.url);
const mobileAssets = new URL("../../mobile/assets/", import.meta.url);
const sharedAssets = [
    "images/sapo-dark.png",
    "images/sapo-mouth-open-dark.png",
    ...iconAssetNames.filter((name) => name !== "apple-logo").map((name) => `icons/${name}.svg`),
];
await Promise.all(
    ["images/", "icons/"].map((directory) =>
        mkdir(new URL(directory, publicAssets), { recursive: true }),
    ),
);
await Promise.all(
    sharedAssets.map((file) => cp(new URL(file, mobileAssets), new URL(file, publicAssets))),
);
