import { TURSO_AUTH_TOKEN, TURSO_DATABASE_URL } from '$app/env/private';
import { createClient, type Client } from '@libsql/client/http';
import { tursoConfig } from './turso-config.ts';

let client: Client | undefined;

export function getTursoClient(): Client {
	return (client ??= createClient({
		...tursoConfig(TURSO_DATABASE_URL, TURSO_AUTH_TOKEN),
		concurrency: 20,
		fetch: (input: RequestInfo | URL, options?: RequestInit) => {
			const signal = options?.signal ?? (input instanceof Request ? input.signal : undefined);
			const timeout = AbortSignal.timeout(8_000);
			return fetch(input, {
				...options,
				redirect: 'error',
				signal: signal ? AbortSignal.any([signal, timeout]) : timeout
			});
		}
	}));
}
