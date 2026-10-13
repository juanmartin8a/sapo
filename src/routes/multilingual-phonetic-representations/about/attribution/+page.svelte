<script lang="ts">
	import { resolve } from '$app/paths';
	import MarkdownDocument from '#lib/MarkdownDocument.svelte';
	import databaseAttribution from '#lib/content/database-attribution.md?raw';
</script>

<svelte:head>
	<meta
		name="description"
		content="Data sources, wordfreq and SUBTLEX credits, licensing, and provenance for the Multilingual Phonetic Representations database."
	/>
</svelte:head>

<MarkdownDocument markdown={databaseAttribution} title="Data sources & attribution" />

<nav class="resource-section" aria-label="Database resources">
	<a class="resource-link" href={resolve('multilingual-phonetic-representations/about/')}
		>About the database <span aria-hidden="true">→</span></a
	>
</nav>
