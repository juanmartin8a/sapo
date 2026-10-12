import { TURSO_AUTH_TOKEN, TURSO_DATABASE_URL } from '$app/env/private';
import { createTursoReader, type Database } from './turso-client.ts';

let client: Database | undefined;

export function getTursoClient(): Database {
	return (client ??= createTursoReader(TURSO_DATABASE_URL, TURSO_AUTH_TOKEN));
}
