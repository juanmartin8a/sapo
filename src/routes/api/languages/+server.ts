import { databaseResponse } from '#lib/server/database-response.js';
import { listLanguages } from '#lib/server/pronunciations.js';
import { getTursoClient } from '#lib/server/turso.js';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = () =>
	databaseResponse(() => listLanguages(getTursoClient()), 3600);
