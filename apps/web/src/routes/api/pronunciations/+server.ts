import { databaseResponse } from '#lib/server/database-response.js';
import { listPronunciations, parsePronunciationQuery } from '#lib/server/pronunciations.js';
import { getTursoClient } from '#lib/server/turso.js';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = ({ url }) =>
	databaseResponse(() => {
		// Validate before initializing the client or contacting the database.
		const query = parsePronunciationQuery(url.searchParams);
		return listPronunciations(getTursoClient(), query);
	}, 300);
