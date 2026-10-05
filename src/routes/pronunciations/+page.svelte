<script lang="ts">
	import PageHeading from '$lib/PageHeading.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import {
		getConvexClient,
		listByLanguagePairRef,
		listLanguagesRef,
		type Language,
		type Pronunciation
	} from '$lib/convex';

	const PAGE_SIZE = 50;
	const filters = [
		{ key: 'source', label: 'Source language' },
		{ key: 'target', label: 'Target language' }
	] as const;

	let mounted = $state(false);
	let languages = $state.raw<Language[]>([]);
	let languagesStatus = $state<'loading' | 'ready' | 'error'>('loading');

	// Read query parameters only after hydration; the shell is statically prerendered.
	let source = $derived(mounted ? (page.url.searchParams.get('source') ?? '') : '');
	let target = $derived(mounted ? (page.url.searchParams.get('target') ?? '') : '');

	let rows = $state.raw<Pronunciation[]>([]);
	let resultsStatus = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	// cursors[i] is the cursor that loads page i (page 0 starts at null).
	let cursors: (string | null)[] = [null];
	let pageIndex = $state(0);
	let requestedPage = 0;
	let isDone = $state(true);
	let requestId = 0;

	const languageNames = $derived(new Map(languages.map((l) => [l.language_code, l.name])));
	const nameFor = (code: string) => languageNames.get(code) ?? code;

	async function loadLanguages() {
		languagesStatus = 'loading';
		try {
			const result = await getConvexClient().query(listLanguagesRef, {});
			if (!mounted) return;
			languages = result;
			languagesStatus = 'ready';
		} catch {
			if (!mounted) return;
			languagesStatus = 'error';
		}
	}

	async function loadPage(index: number) {
		const cursor = cursors[index];
		if (!mounted || !source || !target || cursor === undefined) return;
		const id = ++requestId;
		requestedPage = index;
		resultsStatus = 'loading';
		try {
			const result = await getConvexClient().query(listByLanguagePairRef, {
				sourceLanguageCode: source,
				targetLanguageCode: target,
				paginationOpts: { numItems: PAGE_SIZE, cursor }
			});
			if (id !== requestId) return;
			rows = result.page;
			isDone = result.isDone;
			pageIndex = index;
			cursors = cursors.slice(0, index + 1);
			if (!result.isDone) cursors.push(result.continueCursor);
			resultsStatus = 'ready';
		} catch {
			if (id !== requestId) return;
			resultsStatus = 'error';
		}
	}

	function setFilter(key: 'source' | 'target', value: string) {
		const url = new URL(page.url);
		if (value) url.searchParams.set(key, value);
		else url.searchParams.delete(key);
		goto(resolve(`/pronunciations/?${url.searchParams}${url.hash}`), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	onMount(() => {
		mounted = true;
		void loadLanguages();
		return () => {
			mounted = false;
		};
	});

	// Any filter change resets pagination to page 1.
	$effect(() => {
		const hasPair = Boolean(source && target);
		untrack(() => {
			cursors = [null];
			pageIndex = 0;
			requestedPage = 0;
			rows = [];
			if (hasPair) {
				loadPage(0);
			} else {
				requestId++;
				resultsStatus = 'idle';
			}
		});
		return () => {
			requestId++;
		};
	});

	function goToPage(index: number) {
		loadPage(index);
		document.getElementById('results')?.scrollIntoView({ block: 'start' });
	}
</script>

<svelte:head>
	<title>Pronunciations | S A P O</title>
	<meta
		name="description"
		content="Browse SAPO pronunciations by source and target language, with IPA and easy-to-read respellings."
	/>
</svelte:head>

<section aria-label="Open database">
	<PageHeading title="How words sound" />
	<p class="page-intro">
		Pick the language a word is written in and the language you want it pronounced for.
	</p>
</section>

<section aria-label="Filters" class="filters resource-section">
	{#each filters as filter (filter.key)}
		<label>
			<span>{filter.label}</span>
			<select
				value={filter.key === 'source' ? source : target}
				disabled={languagesStatus !== 'ready'}
				onchange={(event) => setFilter(filter.key, event.currentTarget.value)}
			>
				<option value=""
					>{languagesStatus === 'loading' ? 'Loading languages…' : 'Choose a language'}</option
				>
				{#each languages as language (language.language_code)}
					<option value={language.language_code}>{language.name}</option>
				{/each}
			</select>
		</label>
	{/each}
	{#if languagesStatus === 'error'}
		<div role="alert" class="status-message filter-error">
			<span>Couldn't load languages. Please try again.</span>
			<button type="button" class="text-button" onclick={loadLanguages}
				>Retry <span aria-hidden="true">↗</span></button
			>
		</div>
	{/if}
</section>

<noscript><p class="status-message">Enable JavaScript to browse pronunciations.</p></noscript>

<section id="results" aria-live="polite" aria-busy={resultsStatus === 'loading'}>
	{#if resultsStatus === 'idle'}
		<p class="empty-state">Choose a source and a target language to see pronunciations.</p>
	{:else if resultsStatus === 'error'}
		<div role="alert" class="status-message">
			<span>Couldn't load pronunciations. Please try again.</span>
			<button type="button" class="text-button" onclick={() => loadPage(requestedPage)}
				>Retry <span aria-hidden="true">↗</span></button
			>
		</div>
	{:else if resultsStatus === 'loading' && rows.length === 0}
		<div class="loading-rows" aria-label="Loading pronunciations">
			<p class="loading-label">Loading pronunciations…</p>
			{#each Array(6).keys() as i (i)}<div class="loading-row"></div>{/each}
		</div>
	{:else if rows.length === 0}
		<p class="empty-state">
			No pronunciations on this page for {nameFor(source)} → {nameFor(target)}.
		</p>
	{:else}
		<div class="result-list" class:loading={resultsStatus === 'loading'}>
			<div class="desktop-results">
				<table>
					<thead>
						<tr
							><th scope="col">Word</th><th scope="col">Source</th><th scope="col">Target</th><th
								scope="col">IPA</th
							><th scope="col">Respelling</th></tr
						>
					</thead>
					<tbody>
						{#each rows as row (row._id)}
							<tr>
								<td class="word"><bdi>{row.orthographic_form}</bdi></td>
								<td class="language">{nameFor(row.source_language_code)}</td>
								<td class="language">{nameFor(row.target_language_code)}</td>
								<td class="ipa"><bdi>{row.ipa}</bdi></td>
								<td><bdi>{row.respelling}</bdi></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<ul class="mobile-results">
				{#each rows as row (row._id)}
					<li>
						<p class="word"><bdi>{row.orthographic_form}</bdi></p>
						<p class="language-pair">
							{nameFor(row.source_language_code)} → {nameFor(row.target_language_code)}
						</p>
						<dl>
							<dt>IPA</dt>
							<dd class="ipa"><bdi>{row.ipa}</bdi></dd>
							<dt>Respelling</dt>
							<dd><bdi>{row.respelling}</bdi></dd>
						</dl>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if resultsStatus === 'ready' || (resultsStatus === 'loading' && rows.length > 0)}
		<nav aria-label="Pagination" class="pagination">
			<button
				type="button"
				class="text-button"
				disabled={pageIndex === 0 || resultsStatus === 'loading'}
				onclick={() => goToPage(pageIndex - 1)}>← Previous</button
			>
			<span>Page {pageIndex + 1}</span>
			<button
				type="button"
				class="text-button"
				disabled={isDone || resultsStatus === 'loading'}
				onclick={() => goToPage(pageIndex + 1)}>Next →</button
			>
		</nav>
	{/if}
</section>

<style>
	.filters {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 24px 48px;
		margin-bottom: 32px;
	}
	label {
		display: grid;
		gap: 12px;
		min-width: 0;
		font-size: 13px;
		color: var(--muted);
	}
	select {
		width: 100%;
		min-height: 48px;
		border: 1px solid var(--line);
		border-radius: 0;
		background: #fff;
		padding: 12px;
		color: var(--ink);
		font: inherit;
		font-size: 15px;
	}
	select:disabled {
		opacity: 0.6;
	}
	.filter-error {
		grid-column: 1 / -1;
	}
	#results {
		scroll-margin-top: 24px;
	}
	.empty-state {
		border-top: 1px solid var(--line);
		padding: 32px 0;
		color: var(--muted);
		font-size: 15px;
		line-height: 1.75;
	}
	.result-list {
		transition: opacity 150ms;
	}
	.result-list.loading {
		opacity: 0.5;
	}
	.desktop-results {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		text-align: left;
		font-size: 15px;
	}
	th,
	td {
		padding: 16px 20px 16px 0;
		border-bottom: 1px solid var(--line);
		vertical-align: top;
	}
	th {
		border-top: 1px solid var(--line);
		color: var(--muted);
		font-size: 13px;
		font-weight: 400;
	}
	th:last-child,
	td:last-child {
		padding-right: 0;
	}
	.word {
		font-family: 'Times New Roman', Times, serif;
		font-size: 22px;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}
	.language,
	.language-pair,
	dt {
		color: var(--muted);
	}
	.ipa {
		font-family:
			'Charis SIL', 'Doulos SIL', 'Gentium Plus', 'Noto Sans', 'Segoe UI', 'Lucida Sans Unicode',
			sans-serif;
		font-size: 1.05rem;
	}
	.mobile-results {
		display: none;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.mobile-results li {
		border-top: 1px solid var(--line);
		padding: 24px 0;
	}
	.mobile-results li:last-child {
		border-bottom: 1px solid var(--line);
	}
	.mobile-results p {
		margin: 0;
	}
	.mobile-results .language-pair {
		margin-top: 8px;
		font-size: 13px;
	}
	dl {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 8px 16px;
		margin: 20px 0 0;
		font-size: 15px;
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.pagination {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-top: 24px;
		font-size: 13px;
		color: var(--muted);
	}
	.loading-label {
		color: var(--muted);
		font-size: 15px;
	}
	.loading-row {
		height: 56px;
		border-top: 1px solid var(--line);
		background: #f7f8f6;
		animation: pulse 1.5s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			opacity: 0.4;
		}
	}
	@media (max-width: 767px) {
		.desktop-results {
			display: none;
		}
		.mobile-results {
			display: block;
		}
	}
	@media (max-width: 640px) {
		.filters {
			grid-template-columns: 1fr;
			gap: 24px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.loading-row {
			animation: none;
		}
		.result-list {
			transition: none;
		}
	}
</style>
