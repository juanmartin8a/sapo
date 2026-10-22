import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { markdownToHtml } from "../src/lib/markdown.ts";

// Captured from the original Svelte site before migrating its pages.
const fixture = JSON.parse(
    readFileSync(new URL("./fixtures/site-content.json", import.meta.url), "utf8"),
) as {
    markdown: Record<string, { source: string; html: string }>;
};
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
for (const [file, expected] of Object.entries(fixture.markdown)) {
    test(`${file} preserves its exact source and rendered content`, () => {
        const markdown = readFileSync(
            new URL(`../src/lib/content/${file}`, import.meta.url),
            "utf8",
        );
        assert.equal(hash(markdown), expected.source);
        assert.equal(hash(markdownToHtml(markdown)), expected.html);
    });
}
