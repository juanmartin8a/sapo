<script lang="ts">
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

<main class="min-h-svh px-4 py-4 text-[#181A18] sm:px-6 sm:py-5 lg:px-10">
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-8">
		<header class="flex items-center justify-between gap-4">
			<a href={resolve('/')} class="text-sm font-semibold tracking-[0.34em] text-[#181A18]">
				S&nbsp;A&nbsp;P&nbsp;O
			</a>
			<nav
				class="flex items-center gap-3 text-[0.7rem] font-semibold tracking-[0.2em] text-[#686B65] uppercase sm:text-xs"
			>
				<a class="transition hover:text-[#181A18]" href={resolve('/')}>Home</a>
				<a class="transition hover:text-[#181A18]" href={resolve('/support/')}>Support</a>
			</nav>
		</header>

		<section class="pt-4 sm:pt-8">
			<p
				class="mb-3 text-[0.68rem] font-bold tracking-[0.28em] text-[#797C75] uppercase sm:text-xs"
			>
				Pronunciations
			</p>
			<h1 class="text-4xl leading-none font-black tracking-[-0.06em] sm:text-6xl">
				How words sound
			</h1>
			<p class="mt-4 max-w-2xl text-[#686B65]">
				Pick the language a word is written in and the language you want it pronounced for.
			</p>
		</section>

		<section
			aria-label="Filters"
			class="grid gap-4 rounded-3xl border border-[#E5E8DF] bg-white/80 p-4 sm:grid-cols-2 sm:p-6"
		>
			{#each filters as filter (filter.key)}
				<label class="grid gap-2">
					<span class="text-xs font-bold tracking-[0.2em] text-[#797C75] uppercase">
						{filter.label}
					</span>
					<select
						class="w-full rounded-2xl border border-[#C5D8C0] bg-[#F8FBF6] px-4 py-3 text-base font-semibold text-[#181A18] focus:border-[#181A18] focus:outline-none disabled:opacity-60"
						value={filter.key === 'source' ? source : target}
						disabled={languagesStatus !== 'ready'}
						onchange={(event) => setFilter(filter.key, event.currentTarget.value)}
					>
						<option value="">
							{languagesStatus === 'loading' ? 'Loading languages…' : 'Choose a language'}
						</option>
						{#each languages as language (language.language_code)}
							<option value={language.language_code}>{language.name}</option>
						{/each}
					</select>
				</label>
			{/each}

			{#if languagesStatus === 'error'}
				<div
					role="alert"
					class="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#FBEDEA] p-4 text-sm text-[#7A2E22] sm:col-span-2"
				>
					<span>Couldn't load languages. Please try again.</span>
					<button
						type="button"
						class="rounded-full bg-[#181A18] px-4 py-2 font-semibold text-white"
						onclick={loadLanguages}>Retry</button
					>
				</div>
			{/if}
		</section>

		<noscript><p>Enable JavaScript to browse pronunciations.</p></noscript>

		<section
			id="results"
			aria-live="polite"
			aria-busy={resultsStatus === 'loading'}
			class="scroll-mt-4 pb-12"
		>
			{#if resultsStatus === 'idle'}
				<p class="rounded-3xl border border-dashed border-[#C5D8C0] p-8 text-center text-[#686B65]">
					Choose a source and a target language to see pronunciations.
				</p>
			{:else if resultsStatus === 'error'}
				<div
					role="alert"
					class="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-[#FBEDEA] p-6 text-[#7A2E22]"
				>
					<span>Couldn't load pronunciations. Please try again.</span>
					<button
						type="button"
						class="rounded-full bg-[#181A18] px-4 py-2 font-semibold text-white"
						onclick={() => loadPage(requestedPage)}>Retry</button
					>
				</div>
			{:else if resultsStatus === 'loading' && rows.length === 0}
				<div class="grid gap-3" aria-busy="true" aria-label="Loading pronunciations">
					{#each Array(6).keys() as i (i)}
						<div class="h-14 animate-pulse rounded-2xl bg-[#E1ECDD]"></div>
					{/each}
				</div>
			{:else if rows.length === 0}
				<p class="rounded-3xl border border-dashed border-[#C5D8C0] p-8 text-center text-[#686B65]">
					No pronunciations on this page for {nameFor(source)} → {nameFor(target)}.
				</p>
			{:else}
				<div class:opacity-50={resultsStatus === 'loading'} class="transition-opacity">
					<!-- Desktop table -->
					<div class="hidden overflow-x-auto rounded-3xl border border-[#E5E8DF] bg-white md:block">
						<table class="w-full border-collapse text-left">
							<thead class="bg-[#E1ECDD] text-xs tracking-[0.16em] text-[#686B65] uppercase">
								<tr>
									<th class="px-4 py-3">Word</th>
									<th class="px-4 py-3">Source</th>
									<th class="px-4 py-3">Target</th>
									<th class="px-4 py-3">IPA</th>
									<th class="px-4 py-3">Respelling</th>
								</tr>
							</thead>
							<tbody>
								{#each rows as row (row._id)}
									<tr class="border-t border-[#E5E8DF] align-top">
										<td class="px-4 py-3 text-lg font-bold"><bdi>{row.orthographic_form}</bdi></td>
										<td class="px-4 py-3 text-[#686B65]">{nameFor(row.source_language_code)}</td>
										<td class="px-4 py-3 text-[#686B65]">{nameFor(row.target_language_code)}</td>
										<td class="ipa px-4 py-3"><bdi>{row.ipa}</bdi></td>
										<td class="px-4 py-3"><bdi>{row.respelling}</bdi></td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<!-- Mobile cards -->
					<ul class="grid gap-3 md:hidden">
						{#each rows as row (row._id)}
							<li class="rounded-2xl border border-[#E5E8DF] bg-white p-4">
								<p class="text-xl font-bold break-words"><bdi>{row.orthographic_form}</bdi></p>
								<p class="mt-1 text-xs tracking-[0.12em] text-[#797C75] uppercase">
									{nameFor(row.source_language_code)} → {nameFor(row.target_language_code)}
								</p>
								<dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
									<dt class="text-sm text-[#797C75]">IPA</dt>
									<dd class="ipa break-words"><bdi>{row.ipa}</bdi></dd>
									<dt class="text-sm text-[#797C75]">Respelling</dt>
									<dd class="break-words"><bdi>{row.respelling}</bdi></dd>
								</dl>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if resultsStatus === 'ready' || (resultsStatus === 'loading' && rows.length > 0)}
				<nav aria-label="Pagination" class="mt-6 flex items-center justify-between gap-3">
					<button
						type="button"
						class="rounded-full border border-[#C5D8C0] px-5 py-2 font-semibold disabled:opacity-40"
						disabled={pageIndex === 0 || resultsStatus === 'loading'}
						onclick={() => goToPage(pageIndex - 1)}>← Previous</button
					>
					<span class="text-sm font-semibold text-[#686B65]">Page {pageIndex + 1}</span>
					<button
						type="button"
						class="rounded-full border border-[#C5D8C0] px-5 py-2 font-semibold disabled:opacity-40"
						disabled={isDone || resultsStatus === 'loading'}
						onclick={() => goToPage(pageIndex + 1)}>Next →</button
					>
				</nav>
			{/if}
		</section>
	</div>
</main>

<style>
	.ipa {
		font-family:
			'Charis SIL', 'Doulos SIL', 'Gentium Plus', 'Noto Sans', 'Segoe UI', 'Lucida Sans Unicode',
			sans-serif;
		font-size: 1.05rem;
	}
</style>
