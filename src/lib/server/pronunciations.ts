import { Buffer } from 'node:buffer';
import type { InValue, Row } from '@libsql/client';
import type { Database } from './turso-client.ts';
import type { Language, Pronunciation, PronunciationPage } from '../pronunciations.ts';

const PAGE_SIZE = 25;
type Position = { createdAt: number; id: string };
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
		if (!cursor || cursor.length > 2048 || !/^[\w-]+$/.test(cursor)) throw new Error();
		const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
		if (
			!Array.isArray(value) ||
			value.length !== 5 ||
			value[0] !== 1 ||
			value[1] !== source ||
			value[2] !== target ||
			typeof value[3] !== 'number' ||
			!Number.isFinite(value[3]) ||
			typeof value[4] !== 'string' ||
			!value[4] ||
			value[4].length > 256
		)
			throw new Error();
		return { source, target, position: { createdAt: value[3], id: value[4] } };
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
	if (position) args.push(position.createdAt, position.id);
	args.push(PAGE_SIZE + 1);
	const { rows } = await db.execute({
		// The pair and tuple seek match pronunciation_respellings_by_source_and_target.
		// Join on both transcription and entry IDs to preserve pronunciation variants.
		sql: `SELECT r.id, r.created_at, e.orthographic_form, p.transcription AS ipa, r.respelling
			FROM pronunciation_respellings AS r
			JOIN entries AS e ON e.id = r.entry_id AND e.language_id = r.source_language_id
			JOIN phonetic_transcriptions AS p ON p.id = r.phonetic_transcription_id AND p.entry_id = r.entry_id
			WHERE r.source_language_id = (SELECT id FROM languages WHERE language_code = ?)
				AND r.target_language_id = (SELECT id FROM languages WHERE language_code = ?)
				${position ? 'AND (r.created_at, r.id) > (?, ?)' : ''}
			ORDER BY r.created_at, r.id
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
		if (typeof last.created_at !== 'number' || !Number.isFinite(last.created_at)) {
			throw new Error('Invalid database timestamp.');
		}
		nextCursor = Buffer.from(
			JSON.stringify([1, source, target, last.created_at, text(last, 'id')])
		).toString('base64url');
	}
	return { page, nextCursor };
}
