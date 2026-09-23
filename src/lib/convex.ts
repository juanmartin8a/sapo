import { PUBLIC_CONVEX_URL } from '$env/static/public';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';

/**
 * Read-only client for the SAPO Convex deployment.
 * The function references mirror `pronunciations.ts` in the convex repo.
 */

export type Language = {
	language_code: string;
	name: string;
};

export type Pronunciation = {
	_id: string;
	orthographic_form: string;
	source_language_code: string;
	target_language_code: string;
	ipa: string;
	respelling: string;
};

export type PronunciationPage = {
	page: Pronunciation[];
	isDone: boolean;
	continueCursor: string;
};

type PaginationOpts = { numItems: number; cursor: string | null };

export const listLanguagesRef = makeFunctionReference<'query', Record<string, never>, Language[]>(
	'pronunciations:listLanguages'
);

export const listByLanguagePairRef = makeFunctionReference<
	'query',
	{ sourceLanguageCode: string; targetLanguageCode: string; paginationOpts: PaginationOpts },
	PronunciationPage
>('pronunciations:listByLanguagePair');

let client: ConvexHttpClient | null = null;

export function getConvexClient(): ConvexHttpClient {
	if (!PUBLIC_CONVEX_URL) {
		throw new Error('PUBLIC_CONVEX_URL is not configured.');
	}
	client ??= new ConvexHttpClient(PUBLIC_CONVEX_URL);
	return client;
}
