import { cp, mkdir, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const sharedAssets = fileURLToPath(
    new URL("../../mobile/assets/", import.meta.url),
);
await mkdir(join(appRoot, "public/images"), { recursive: true });
await mkdir(join(appRoot, "public/icons"), { recursive: true });
for (const file of ["sapo.png", "sapo-mouth-open.png"]) {
    await cp(
        join(sharedAssets, "images", file),
        join(appRoot, "public/images", file),
    );
}
for (const file of await readdir(join(sharedAssets, "icons"))) {
    if (file.endsWith(".svg"))
        await cp(
            join(sharedAssets, "icons", file),
            join(appRoot, "public/icons", file),
        );
}
