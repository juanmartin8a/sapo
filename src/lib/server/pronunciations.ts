import { Buffer } from 'node:buffer';
import type { InValue, Row } from '@libsql/client';
import type { Database } from './turso-client.ts';
import type { Language, Pronunciation, PronunciationPage } from '../pronunciations.ts';

const PAGE_SIZE = 25;
type Position = { word: string; entryId: string; id: string };
export type PronunciationQuery = {
	source: string;
	target: string;
	position: Position | null;
};

export class InvalidPronunciationQuery extends Error {}

function languageCode(params: URLSearchParams, key: string): string {
	const value = params.get(key);
	if (!value || value.length > 64 || /[\s\p{Cc}\p{Cf}]/u.test(value)) {
		throw new InvalidPronunciationQuery('Source and target language codes are required.');
	}
	return value;
}

export function parsePronunciationQuery(params: URLSearchParams): PronunciationQuery {
	for (const key of params.keys()) {
		if (!['source', 'target', 'cursor'].includes(key) || params.getAll(key).length !== 1) {
			throw new InvalidPronunciationQuery('Invalid query parameters.');
		}
	}
	const source = languageCode(params, 'source');
	const target = languageCode(params, 'target');
	const cursor = params.get('cursor');
	if (cursor === null) return { source, target, position: null };
	try {
		if (!cursor || cursor.length > 16384 || !/^[\w-]+$/.test(cursor)) throw new Error();
		const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
		if (
			!Array.isArray(value) ||
			value.length !== 6 ||
			value[0] !== 2 ||
			value[1] !== source ||
			value[2] !== target ||
			typeof value[3] !== 'string' ||
			typeof value[4] !== 'string' ||
			!value[4] ||
			value[4].length > 256 ||
			typeof value[5] !== 'string' ||
			!value[5] ||
			value[5].length > 256
		)
			throw new Error();
		return { source, target, position: { word: value[3], entryId: value[4], id: value[5] } };
	} catch {
		throw new InvalidPronunciationQuery('Invalid pagination cursor for this language pair.');
	}
}

function text(row: Row, column: string): string {
	const value = row[column];
	if (typeof value !== 'string') throw new Error(`Invalid database column: ${column}.`);
	return value;
}

export async function listLanguages(db: Database): Promise<Language[]> {
	const { rows } = await db.execute(
		'SELECT language_code, name FROM languages ORDER BY name, language_code'
	);
	return rows.map((row) => ({
		language_code: text(row, 'language_code'),
		name: text(row, 'name')
	}));
}

export async function listPronunciations(
	db: Database,
	query: PronunciationQuery
): Promise<PronunciationPage> {
	const { source, target, position } = query;
	const args: InValue[] = [source, target];
	if (position) {
		args.push(position.word, position.entryId, position.word, position.entryId, position.id);
	}
	args.push(PAGE_SIZE + 1);
	const { rows } = await db.execute({
		// Drive the join from the covering alphabetical index, not the timestamp pair index.
		// CROSS JOIN fixes that loop order; only each entry's variants need a small sort.
		// Include the boundary entry so pages can split its pronunciation variants.
		sql: `SELECT r.id, e.id AS entry_id, e.orthographic_form, p.transcription AS ipa, r.respelling
			FROM entries AS e INDEXED BY entries_by_language_and_orth
			CROSS JOIN pronunciation_respellings AS r INDEXED BY pronunciation_respellings_by_entry
			JOIN phonetic_transcriptions AS p ON p.id = r.phonetic_transcription_id AND p.entry_id = e.id
			WHERE e.language_id = (SELECT id FROM languages WHERE language_code = ?)
				AND r.entry_id = e.id AND r.source_language_id = e.language_id
				AND r.target_language_id = (SELECT id FROM languages WHERE language_code = ?)
				${position ? 'AND (e.orthographic_form, e.id) >= (?, ?) AND (e.orthographic_form != ? OR e.id != ? OR r.id > ?)' : ''}
			ORDER BY e.orthographic_form, e.id, r.id
			LIMIT ?`,
		args
	});
	const visible = rows.slice(0, PAGE_SIZE);
	const page: Pronunciation[] = visible.map((row) => ({
		id: text(row, 'id'),
		orthographic_form: text(row, 'orthographic_form'),
		source_language_code: source,
		target_language_code: target,
		ipa: text(row, 'ipa'),
		respelling: text(row, 'respelling')
	}));
	let nextCursor: string | null = null;
	if (rows.length > PAGE_SIZE) {
		const last = visible[visible.length - 1];
		nextCursor = Buffer.from(
			JSON.stringify([
				2,
				source,
				target,
				text(last, 'orthographic_form'),
				text(last, 'entry_id'),
				text(last, 'id')
			])
		).toString('base64url');
	}
	return { page, nextCursor };
}
