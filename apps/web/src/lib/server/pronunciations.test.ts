import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createClient, type InArgs, type InStatement } from "@libsql/client";
import {
    InvalidPronunciationQuery,
    listLanguages,
    listPronunciations,
    parsePronunciationQuery,
} from "./pronunciations.ts";
import { tursoConfig } from "./turso-config.ts";
import { databaseResponse } from "./database-response.ts";

const db = createClient({ url: ":memory:" });
after(() => db.close());

// Full schema snapshot from sapo-mpr/database/schema.sql, including all indexes.
await db.executeMultiple(`
	PRAGMA foreign_keys = ON;
	CREATE TABLE IF NOT EXISTS languages (
	    id TEXT PRIMARY KEY NOT NULL,
	    created_at REAL NOT NULL,
	    language_code TEXT NOT NULL,
	    name TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS entries (
	    id TEXT PRIMARY KEY NOT NULL,
	    created_at REAL NOT NULL,
	    orthographic_form TEXT NOT NULL,
	    frequency REAL NOT NULL,
	    language_id TEXT NOT NULL REFERENCES languages(id)
	);

	CREATE TABLE IF NOT EXISTS phonetic_transcriptions (
	    id TEXT PRIMARY KEY NOT NULL,
	    created_at REAL NOT NULL,
	    entry_id TEXT NOT NULL REFERENCES entries(id),
	    type TEXT NOT NULL CHECK (type = 'ipa'),
	    transcription TEXT NOT NULL,
	    UNIQUE (id, entry_id)
	);

	CREATE TABLE IF NOT EXISTS pronunciation_respellings (
	    id TEXT PRIMARY KEY NOT NULL,
	    created_at REAL NOT NULL,
	    entry_id TEXT NOT NULL REFERENCES entries(id),
	    phonetic_transcription_id TEXT NOT NULL,
	    target_language_id TEXT NOT NULL REFERENCES languages(id),
	    type TEXT NOT NULL CHECK (type IN ('cross-lingual', 'intralingual')),
	    respelling TEXT NOT NULL,
	    source_language_id TEXT NOT NULL REFERENCES languages(id),
	    FOREIGN KEY (phonetic_transcription_id, entry_id)
	        REFERENCES phonetic_transcriptions(id, entry_id),
	    CHECK (
	        (type = 'intralingual' AND source_language_id = target_language_id)
	        OR (type = 'cross-lingual' AND source_language_id <> target_language_id)
	    )
	);

	CREATE UNIQUE INDEX IF NOT EXISTS languages_by_language_code
	    ON languages(language_code);
	CREATE INDEX IF NOT EXISTS entries_by_orth
	    ON entries(orthographic_form);
	CREATE INDEX IF NOT EXISTS entries_by_language_and_orth
	    ON entries(language_id, orthographic_form, id);
	CREATE INDEX IF NOT EXISTS phonetic_transcriptions_by_entry
	    ON phonetic_transcriptions(entry_id);
	CREATE UNIQUE INDEX IF NOT EXISTS pronunciation_respellings_unique_target
	    ON pronunciation_respellings(phonetic_transcription_id, target_language_id);
	CREATE INDEX IF NOT EXISTS pronunciation_respellings_by_source_and_target
	    ON pronunciation_respellings(source_language_id, target_language_id, created_at, id);
	CREATE INDEX IF NOT EXISTS pronunciation_respellings_by_entry
	    ON pronunciation_respellings(entry_id);
	INSERT INTO languages VALUES ('en', 0, 'en', 'English'), ('es', 0, 'es', 'Spanish'), ('fr', 0, 'fr', 'French');
`);

const inserts: InStatement[] = [];
for (let i = 0; i < 102; i++) {
    const id = `r${String(i).padStart(3, "0")}`;
    inserts.push(
        { sql: "INSERT INTO entries VALUES (?, 0, ?, 1, ?)", args: [id, `word ${i}`, "en"] },
        {
            sql: "INSERT INTO phonetic_transcriptions VALUES (?, 0, ?, 'ipa', ?)",
            args: [id, id, `/ipa ${i}/`],
        },
        {
            sql: "INSERT INTO pronunciation_respellings VALUES (?, ?, ?, ?, 'es', 'cross-lingual', ?, 'en')",
            args: [id, Math.floor(i / 60) + 0.125, id, id, `guide ${i}`],
        },
    );
}
await db.batch(inserts, "write");
await db.executeMultiple(`
	INSERT INTO phonetic_transcriptions VALUES ('variant', 0, 'r000', 'ipa', '/variant/');
	INSERT INTO pronunciation_respellings VALUES ('variant', 3, 'r000', 'variant', 'es', 'cross-lingual', 'alternate', 'en');
	INSERT INTO pronunciation_respellings VALUES ('same-language', 0, 'r000', 'r000', 'en', 'intralingual', 'same', 'en');
	INSERT INTO pronunciation_respellings VALUES ('other-target', 0, 'r000', 'r000', 'fr', 'cross-lingual', 'other', 'en');
`);

const query = (source = "en", target = "es", cursor?: string) =>
    parsePronunciationQuery(new URLSearchParams({ source, target, ...(cursor ? { cursor } : {}) }));

test("languages are projected and ordered by name", async () => {
    assert.deepEqual(await listLanguages(db), [
        { language_code: "en", name: "English" },
        { language_code: "fr", name: "French" },
        { language_code: "es", name: "Spanish" },
    ]);
});

test("alphabetical keyset pagination preserves IPA variants without duplicates", async () => {
    const first = await listPronunciations(db, query());
    assert.equal(first.page.length, 25);
    assert.equal(first.page[0].id, "r000");
    assert.ok(first.nextCursor);
    const second = await listPronunciations(db, query("en", "es", first.nextCursor));
    assert.equal(second.page.length, 25);
    assert.ok(second.nextCursor);
    const third = await listPronunciations(db, query("en", "es", second.nextCursor));
    assert.equal(third.page.length, 25);
    assert.ok(third.nextCursor);
    const fourth = await listPronunciations(db, query("en", "es", third.nextCursor));
    assert.equal(fourth.page.length, 25);
    assert.ok(fourth.nextCursor);
    const last = await listPronunciations(db, query("en", "es", fourth.nextCursor));
    assert.equal(last.page.length, 3);
    assert.equal(last.nextCursor, null);
    const rows = [...first.page, ...second.page, ...third.page, ...fourth.page, ...last.page];
    assert.equal(new Set(rows.map((row) => row.id)).size, 103);
    const expectedIds = Array.from({ length: 102 }, (_, i) => i)
        .sort((a, b) => (`word ${a}` < `word ${b}` ? -1 : 1))
        .flatMap((i) => (i === 0 ? ["r000", "variant"] : [`r${String(i).padStart(3, "0")}`]));
    assert.deepEqual(
        rows.map((row) => row.id),
        expectedIds,
    );
    assert.deepEqual(rows[1], {
        id: "variant",
        orthographic_form: "word 0",
        source_language_code: "en",
        target_language_code: "es",
        ipa: "/variant/",
        respelling: "alternate",
    });
    assert.deepEqual(await listPronunciations(db, query("en", "es", first.nextCursor)), second);
});

test("pages split repeated words and many variants without skipping either tie-breaker", async () => {
    const tx = await db.transaction("write");
    try {
        await tx.execute("INSERT INTO languages VALUES ('ties', 0, 'ties', 'Ties')");
        const expected: string[] = [];
        for (const [entry, count] of [
            ["tie-a", 31],
            ["tie-b", 2],
            ["tie-c", 30],
        ] as const) {
            await tx.execute({
                sql: "INSERT INTO entries VALUES (?, 0, 'same word', 1, 'ties')",
                args: [entry],
            });
            for (let i = 0; i < count; i++) {
                const id = `${entry}-${String(i).padStart(2, "0")}`;
                expected.push(id);
                await tx.execute({
                    sql: "INSERT INTO phonetic_transcriptions VALUES (?, 0, ?, 'ipa', '/variant/')",
                    args: [id, entry],
                });
                await tx.execute({
                    sql: "INSERT INTO pronunciation_respellings VALUES (?, 0, ?, ?, 'es', 'cross-lingual', 'guide', 'ties')",
                    args: [id, entry, id],
                });
            }
        }
        const ids: string[] = [];
        let cursor: string | undefined;
        do {
            const result = await listPronunciations(tx, query("ties", "es", cursor));
            assert.ok(result.page.length <= 25);
            ids.push(...result.page.map((row) => row.id));
            cursor = result.nextCursor ?? undefined;
        } while (cursor);
        assert.deepEqual(ids, expected);
    } finally {
        await tx.rollback();
        tx.close();
    }
});

test("alphabetical order follows the existing case-sensitive Unicode index collation", async () => {
    const tx = await db.transaction("write");
    try {
        await tx.execute("INSERT INTO languages VALUES ('letters', 0, 'letters', 'Letters')");
        for (const word of ["éclair", "alpha", "Éclair", "Alpha", "zebra"]) {
            await tx.execute({
                sql: "INSERT INTO entries VALUES (?, 0, ?, 1, 'letters')",
                args: [word, word],
            });
            await tx.execute({
                sql: "INSERT INTO phonetic_transcriptions VALUES (?, 0, ?, 'ipa', '/word/')",
                args: [word, word],
            });
            await tx.execute({
                sql: "INSERT INTO pronunciation_respellings VALUES (?, 0, ?, ?, 'es', 'cross-lingual', 'guide', 'letters')",
                args: [word, word, word],
            });
        }
        const result = await listPronunciations(tx, query("letters", "es"));
        assert.deepEqual(
            result.page.map((row) => row.orthographic_form),
            ["Alpha", "alpha", "zebra", "Éclair", "éclair"],
        );
        assert.equal(result.nextCursor, null);
    } finally {
        await tx.rollback();
        tx.close();
    }
});

test("empty pairs, unknown languages, and SQL-like input return no rows; same-language pairs work", async () => {
    for (const [source, target] of [
        ["es", "en"],
        ["unknown", "es"],
        ["en';--", "es"],
    ]) {
        assert.deepEqual(await listPronunciations(db, query(source, target)), {
            page: [],
            nextCursor: null,
        });
    }
    const same = await listPronunciations(db, query("en", "en"));
    assert.equal(same.page.length, 1);
    assert.equal(same.page[0].id, "same-language");
});

test("invalid parameters and cursors are rejected, including cursors from another pair", async () => {
    const first = await listPronunciations(db, query());
    assert.ok(first.nextCursor);
    const invalid = [
        "",
        "source=en",
        "source=&target=es",
        "source=en&target=es&limit=5000",
        "source=en&source=es&target=es",
        "source=en&target=es&cursor=",
        "source=en&target=es&cursor=not-json",
        "source=en&target=es&cursor=" + "a".repeat(16385),
        "source=en&target=es&cursor=" +
            Buffer.from(JSON.stringify([1, "en", "es", "0", "r000"])).toString("base64url"),
        ...[
            [1, "en", "es", 0.125, "r000"], // Previous timestamp cursor format.
            [2, "en", "es", 0, "r000", "r000"],
            [2, "en", "es", "word 0", "", "r000"],
            [2, "en", "es", "word 0", "r000", ""],
            [2, "en", "es", "word 0", "r000", "x".repeat(257)],
        ].map(
            (value) =>
                "source=en&target=es&cursor=" +
                Buffer.from(JSON.stringify(value)).toString("base64url"),
        ),
        "source=en&target=fr&cursor=" + first.nextCursor,
        "source=" + "a".repeat(65) + "&target=es",
    ];
    for (const params of invalid) {
        assert.throws(
            () => parsePronunciationQuery(new URLSearchParams(params)),
            InvalidPronunciationQuery,
        );
    }
});

test("initial and deep cursor queries seek alphabetical entries and only sort within entries", async () => {
    const first = await listPronunciations(db, query());
    assert.ok(first.nextCursor);
    const deepCursor = Buffer.from(
        JSON.stringify([2, "en", "es", "word 90", "r090", "r090"]),
    ).toString("base64url");
    for (const input of [
        query(),
        query("en", "es", first.nextCursor),
        query("en", "es", deepCursor),
    ]) {
        await listPronunciations(
            {
                execute: async (statement) => {
                    assert.equal(typeof statement, "object");
                    const { sql, args } = statement as { sql: string; args: InArgs };
                    const plan = await db.execute({ sql: `EXPLAIN QUERY PLAN ${sql}`, args });
                    const details = plan.rows.map((row) => String(row.detail)).join("\n");
                    assert.match(
                        details,
                        /SEARCH e USING COVERING INDEX entries_by_language_and_orth/,
                    );
                    assert.match(
                        details,
                        /SEARCH r USING INDEX pronunciation_respellings_by_entry \(entry_id=\?\)/,
                    );
                    if (input.position) {
                        assert.match(details, /\(orthographic_form,id\)>\(\?,\?\)/);
                    }
                    // A block sort of variants is fine; a whole-result sort or table scan is not.
                    assert.doesNotMatch(details, /USE TEMP B-TREE FOR ORDER BY|SCAN [er]\b/);
                    return db.execute(statement);
                },
            },
            input,
        );
    }
});

test("an exactly full final page has no next cursor", async () => {
    const tx = await db.transaction("write");
    try {
        for (let i = 1; i < 25; i++) {
            const entry = `r${String(i).padStart(3, "0")}`;
            await tx.execute({
                sql: "INSERT INTO pronunciation_respellings VALUES (?, 1, ?, ?, 'fr', 'cross-lingual', 'guide', 'en')",
                args: [`f${i}`, entry, entry],
            });
        }
        const result = await listPronunciations(tx, query("en", "fr"));
        assert.equal(result.page.length, 25);
        assert.equal(result.nextCursor, null);
    } finally {
        await tx.rollback();
        tx.close();
    }
});

test("pagination survives boundary deletion; inserts before the cursor require restarting", async () => {
    const tx = await db.transaction("write");
    try {
        const first = await listPronunciations(tx, query());
        assert.ok(first.nextCursor);
        await tx.execute({
            sql: "DELETE FROM pronunciation_respellings WHERE id = ?",
            args: [first.page.at(-1)!.id],
        });
        for (const [id, word] of [
            ["early", "!early"],
            ["new-row", "zzz"],
        ]) {
            await tx.execute({
                sql: "INSERT INTO entries VALUES (?, 4, ?, 1, 'en')",
                args: [id, word],
            });
            await tx.execute({
                sql: "INSERT INTO phonetic_transcriptions VALUES (?, 4, ?, 'ipa', '/new/')",
                args: [id, id],
            });
            await tx.execute({
                sql: "INSERT INTO pronunciation_respellings VALUES (?, 4, ?, ?, 'es', 'cross-lingual', 'new', 'en')",
                args: [id, id, id],
            });
        }
        const second = await listPronunciations(tx, query("en", "es", first.nextCursor));
        assert.ok(!second.page.some((row) => row.id === first.page.at(-1)!.id));
        assert.ok(second.nextCursor);
        const rows = [...first.page, ...second.page];
        let last = second;
        while (last.nextCursor) {
            last = await listPronunciations(tx, query("en", "es", last.nextCursor));
            assert.ok(last.page.length <= 25);
            rows.push(...last.page);
        }
        assert.equal(last.page.at(-1)!.id, "new-row");
        assert.equal(last.nextCursor, null);
        assert.equal(new Set(rows.map((row) => row.id)).size, 104);
        assert.ok(!rows.some((row) => row.id === "early"));
        assert.equal((await listPronunciations(tx, query())).page[0].id, "early");
    } finally {
        await tx.rollback();
        tx.close();
    }
});

test("database configuration accepts secure remote URLs and rejects unsafe or missing settings", () => {
    assert.deepEqual(tursoConfig("libsql://database.turso.io", "token"), {
        url: "https://database.turso.io",
        authToken: "token",
    });
    assert.equal(
        tursoConfig("https://database.turso.io/", "token").url,
        "https://database.turso.io",
    );
    for (const url of [
        undefined,
        "",
        "file:test.db",
        "http://database.turso.io",
        "libsql://database.turso.io?tls=0",
        "https://token@database.turso.io",
        "https://database.turso.io/path",
        "https://database.turso.io#fragment",
    ]) {
        assert.throws(() => tursoConfig(url, "token"));
    }
    assert.throws(() => tursoConfig("https://database.turso.io", " "));
});

test("API responses cache successes, reject bad input, and redact upstream errors", async () => {
    const success = await databaseResponse(async () => ({ page: [] }), 300);
    assert.equal(success.status, 200);
    assert.match(success.headers.get("Cache-Control")!, /s-maxage=300/);
    assert.deepEqual(await success.json(), { page: [] });
    for (const failure of [
        new InvalidPronunciationQuery("Invalid query parameters."),
        new Error("secret-token upstream failure"),
    ]) {
        const response = await databaseResponse(async () => {
            throw failure;
        }, 300);
        assert.equal(response.status, failure instanceof InvalidPronunciationQuery ? 400 : 503);
        assert.equal(response.headers.get("Cache-Control"), "no-store");
        assert.doesNotMatch(await response.text(), /secret-token/);
    }
});
