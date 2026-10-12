import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createClient, type InArgs, type InStatement } from '@libsql/client';
import {
	InvalidPronunciationQuery,
	listLanguages,
	listPronunciations,
	parsePronunciationQuery
} from './pronunciations.ts';
import { tursoConfig } from './turso-config.ts';
import { databaseResponse } from './database-response.ts';

const db = createClient({ url: ':memory:' });
after(() => db.close());

// A minimal fixture matching sapo-mpr/database/schema.sql, including the seek index.
await db.executeMultiple(`
	CREATE TABLE languages (id TEXT PRIMARY KEY, created_at REAL, language_code TEXT, name TEXT);
	CREATE UNIQUE INDEX languages_by_language_code ON languages(language_code);
	CREATE TABLE entries (id TEXT PRIMARY KEY, created_at REAL, orthographic_form TEXT, frequency REAL, language_id TEXT);
	CREATE TABLE phonetic_transcriptions (id TEXT PRIMARY KEY, created_at REAL, entry_id TEXT, type TEXT, transcription TEXT);
	CREATE TABLE pronunciation_respellings (id TEXT PRIMARY KEY, created_at REAL, entry_id TEXT, phonetic_transcription_id TEXT, target_language_id TEXT, type TEXT, respelling TEXT, source_language_id TEXT);
	CREATE INDEX pronunciation_respellings_by_source_and_target ON pronunciation_respellings(source_language_id, target_language_id, created_at, id);
	INSERT INTO languages VALUES ('en', 0, 'en', 'English'), ('es', 0, 'es', 'Spanish'), ('fr', 0, 'fr', 'French');
`);

const inserts: InStatement[] = [];
for (let i = 0; i < 102; i++) {
	const id = `r${String(i).padStart(3, '0')}`;
	inserts.push(
		{ sql: 'INSERT INTO entries VALUES (?, 0, ?, 1, ?)', args: [id, `word ${i}`, 'en'] },
		{
			sql: "INSERT INTO phonetic_transcriptions VALUES (?, 0, ?, 'ipa', ?)",
			args: [id, id, `/ipa ${i}/`]
		},
		{
			sql: "INSERT INTO pronunciation_respellings VALUES (?, ?, ?, ?, 'es', 'cross-lingual', ?, 'en')",
			args: [id, Math.floor(i / 60) + 0.125, id, id, `guide ${i}`]
		}
	);
}
await db.batch(inserts, 'write');
await db.executeMultiple(`
	INSERT INTO phonetic_transcriptions VALUES ('variant', 0, 'r000', 'ipa', '/variant/');
	INSERT INTO pronunciation_respellings VALUES ('variant', 3, 'r000', 'variant', 'es', 'cross-lingual', 'alternate', 'en');
	INSERT INTO pronunciation_respellings VALUES ('same-language', 0, 'r000', 'r000', 'en', 'intralingual', 'same', 'en');
	INSERT INTO pronunciation_respellings VALUES ('other-target', 0, 'r000', 'r000', 'fr', 'cross-lingual', 'other', 'en');
`);

const query = (source = 'en', target = 'es', cursor?: string) =>
	parsePronunciationQuery(new URLSearchParams({ source, target, ...(cursor ? { cursor } : {}) }));

test('languages are projected and ordered by name', async () => {
	assert.deepEqual(await listLanguages(db), [
		{ language_code: 'en', name: 'English' },
		{ language_code: 'fr', name: 'French' },
		{ language_code: 'es', name: 'Spanish' }
	]);
});

test('keyset pagination preserves ties, fractional timestamps, and IPA variants without duplicates', async () => {
	const first = await listPronunciations(db, query());
	assert.equal(first.page.length, 50);
	assert.equal(first.page[0].id, 'r000');
	assert.ok(first.nextCursor);
	const second = await listPronunciations(db, query('en', 'es', first.nextCursor));
	assert.equal(second.page.length, 50);
	assert.ok(second.nextCursor);
	const last = await listPronunciations(db, query('en', 'es', second.nextCursor));
	assert.equal(last.page.length, 3);
	assert.equal(last.nextCursor, null);
	const rows = [...first.page, ...second.page, ...last.page];
	assert.equal(new Set(rows.map((row) => row.id)).size, 103);
	assert.deepEqual(rows.at(-1), {
		id: 'variant',
		orthographic_form: 'word 0',
		source_language_code: 'en',
		target_language_code: 'es',
		ipa: '/variant/',
		respelling: 'alternate'
	});
	assert.deepEqual(await listPronunciations(db, query('en', 'es', first.nextCursor)), second);
});

test('empty pairs, unknown languages, and SQL-like input return no rows; same-language pairs work', async () => {
	for (const [source, target] of [
		['es', 'en'],
		['unknown', 'es'],
		["en';--", 'es']
	]) {
		assert.deepEqual(await listPronunciations(db, query(source, target)), {
			page: [],
			nextCursor: null
		});
	}
	const same = await listPronunciations(db, query('en', 'en'));
	assert.equal(same.page.length, 1);
	assert.equal(same.page[0].id, 'same-language');
});

test('invalid parameters and cursors are rejected, including cursors from another pair', async () => {
	const first = await listPronunciations(db, query());
	assert.ok(first.nextCursor);
	const invalid = [
		'',
		'source=en',
		'source=&target=es',
		'source=en&target=es&limit=5000',
		'source=en&source=es&target=es',
		'source=en&target=es&cursor=',
		'source=en&target=es&cursor=not-json',
		'source=en&target=es&cursor=' + 'a'.repeat(2049),
		'source=en&target=es&cursor=' +
			Buffer.from(JSON.stringify([1, 'en', 'es', '0', 'r000'])).toString('base64url'),
		'source=en&target=fr&cursor=' + first.nextCursor,
		'source=' + 'a'.repeat(65) + '&target=es'
	];
	for (const params of invalid) {
		assert.throws(
			() => parsePronunciationQuery(new URLSearchParams(params)),
			InvalidPronunciationQuery
		);
	}
});

test('both initial and cursor queries use the pair index without a temporary sort', async () => {
	const first = await listPronunciations(db, query());
	assert.ok(first.nextCursor);
	for (const input of [query(), query('en', 'es', first.nextCursor)]) {
		await listPronunciations(
			{
				execute: async (statement) => {
					assert.equal(typeof statement, 'object');
					const { sql, args } = statement as { sql: string; args: InArgs };
					const plan = await db.execute({ sql: `EXPLAIN QUERY PLAN ${sql}`, args });
					const details = plan.rows.map((row) => String(row.detail)).join('\n');
					assert.match(
						details,
						/SEARCH r USING INDEX pronunciation_respellings_by_source_and_target/
					);
					assert.doesNotMatch(details, /USE TEMP B-TREE|SCAN r/);
					return db.execute(statement);
				}
			},
			input
		);
	}
});

test('database configuration accepts secure remote URLs and rejects unsafe or missing settings', () => {
	assert.deepEqual(tursoConfig('libsql://database.turso.io', 'token'), {
		url: 'https://database.turso.io',
		authToken: 'token'
	});
	assert.equal(tursoConfig('https://database.turso.io/', 'token').url, 'https://database.turso.io');
	for (const url of [
		undefined,
		'',
		'file:test.db',
		'http://database.turso.io',
		'libsql://database.turso.io?tls=0',
		'https://token@database.turso.io',
		'https://database.turso.io/path',
		'https://database.turso.io#fragment'
	]) {
		assert.throws(() => tursoConfig(url, 'token'));
	}
	assert.throws(() => tursoConfig('https://database.turso.io', ' '));
});

test('API responses cache successes, reject bad input, and redact upstream errors', async () => {
	const success = await databaseResponse(async () => ({ page: [] }), 300);
	assert.equal(success.status, 200);
	assert.match(success.headers.get('Cache-Control')!, /s-maxage=300/);
	assert.deepEqual(await success.json(), { page: [] });
	for (const failure of [
		new InvalidPronunciationQuery('Invalid query parameters.'),
		new Error('secret-token upstream failure')
	]) {
		const response = await databaseResponse(async () => {
			throw failure;
		}, 300);
		assert.equal(response.status, failure instanceof InvalidPronunciationQuery ? 400 : 503);
		assert.equal(response.headers.get('Cache-Control'), 'no-store');
		assert.doesNotMatch(await response.text(), /secret-token/);
	}
});
