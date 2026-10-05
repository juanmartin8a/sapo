<script lang="ts">
	import { resolve } from '$app/paths';
	import { markdownToHtml } from '$lib/markdown';

	let { markdown, title }: { markdown: string; title: string } = $props();
	const html = $derived(markdownToHtml(markdown));
</script>

<svelte:head>
	<title>{title} | S A P O</title>
</svelte:head>

<main class="min-h-svh px-4 py-4 text-[#181A18] sm:px-6 sm:py-5 lg:px-10">
	<div class="mx-auto max-w-5xl">
		<nav class="mb-8 flex items-center justify-between gap-4 text-sm font-semibold text-[#686B65]">
			<a
				href={resolve('/')}
				class="tracking-[0.34em] text-[#181A18] transition hover:text-[#686B65]"
			>
				S&nbsp;A&nbsp;P&nbsp;O
			</a>

			<div class="flex items-center gap-4 text-[0.7rem] tracking-[0.2em] uppercase sm:text-xs">
				<a href={resolve('/support/')} class="transition hover:text-[#181A18]">Support</a>
			</div>
		</nav>

		<article
			class="legal-document mx-auto max-w-4xl rounded-[2rem] border border-[#E5E8DF]/80 bg-white/70 p-5 sm:p-8 lg:p-10"
		>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html html}
		</article>
	</div>
</main>
