<script lang="ts">
	import { markdownToHtml } from '#lib/markdown.js';

	let { markdown, title }: { markdown: string; title: string } = $props();
	const html = $derived(markdownToHtml(markdown));
</script>

<svelte:head>
	<title>{title} | S A P O</title>
</svelte:head>

<article class="legal-document">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html html}
</article>
