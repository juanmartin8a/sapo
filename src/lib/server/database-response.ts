import { json } from '@sveltejs/kit';
import { InvalidPronunciationQuery } from './pronunciations.ts';
import { DatabaseCapacityError } from './turso-client.ts';

export async function databaseResponse(query: () => Promise<unknown>, maxAge: number) {
	try {
		return json(await query(), {
			headers: {
				'Cache-Control': `public, max-age=60, s-maxage=${maxAge}, stale-while-revalidate=60`,
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} catch (error) {
		const invalid = error instanceof InvalidPronunciationQuery;
		const overloaded = error instanceof DatabaseCapacityError;
		// SDK errors can contain upstream responses or credentials. Do not expose them.
		return json(
			{
				message: invalid ? error.message : 'The pronunciation database is temporarily unavailable.'
			},
			{
				status: invalid ? 400 : 503,
				headers: { 'Cache-Control': 'no-store', ...(overloaded ? { 'Retry-After': '1' } : {}) }
			}
		);
	}
}
