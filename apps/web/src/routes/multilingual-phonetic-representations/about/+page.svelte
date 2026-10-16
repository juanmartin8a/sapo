<script lang="ts">
	import { resolve } from '$app/paths';
	import MarkdownDocument from '#lib/MarkdownDocument.svelte';
	import databaseAbout from '#lib/content/database-about.md?raw';
</script>

<svelte:head>
	<meta
		name="description"
		content="Learn about the Multilingual Phonetic Representations database, its pronunciation guides, data sources, and CC BY-SA 4.0 license."
	/>
</svelte:head>

<MarkdownDocument markdown={databaseAbout} title="About the database" />

<nav class="resource-section database-resources" aria-label="Database resources">
	<a
		class="resource-link"
		href={resolve('multilingual-phonetic-representations/about/attribution/')}
		>Data sources & attribution <span aria-hidden="true">→</span></a
	>
	<a class="resource-link" href={resolve('multilingual-phonetic-representations/')}
		>Browse the database <span aria-hidden="true">→</span></a
	>
</nav>

<style>
	.database-resources {
		display: flex;
		flex-wrap: wrap;
		gap: 16px 40px;
	}
</style>
