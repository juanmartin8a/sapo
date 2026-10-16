import { createClient, type Client, type InStatement, type InArgs } from '@libsql/client/http';
import { tursoConfig } from './turso-config.ts';

export type Database = Pick<Client, 'execute'>;
export class DatabaseCapacityError extends Error {}

export function createTursoReader(
	url: string | undefined,
	token: string | undefined,
	fetchFn: typeof fetch = fetch
): Database {
	const concurrency = 20;
	let active = 0;
	const client = createClient({
		...tursoConfig(url, token),
		concurrency,
		fetch: (input: RequestInfo | URL, options?: RequestInit) => {
			const signal = options?.signal ?? (input instanceof Request ? input.signal : undefined);
			const timeout = AbortSignal.timeout(8_000);
			return fetchFn(input, {
				...options,
				redirect: 'error',
				signal: signal ? AbortSignal.any([signal, timeout]) : timeout
			});
		}
	});
	return {
		async execute(statement: InStatement, args?: InArgs) {
			// Reject overload before the SDK's unbounded queue, where its fetch timeout
			// has not started yet. Every admitted read can start immediately.
			if (active >= concurrency)
				throw new DatabaseCapacityError('Database read capacity exceeded.');
			active++;
			try {
				return await (typeof statement === 'string'
					? client.execute(statement, args)
					: client.execute(statement));
			} finally {
				active--;
			}
		}
	};
}
