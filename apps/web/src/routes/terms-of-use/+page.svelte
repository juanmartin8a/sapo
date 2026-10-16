<script lang="ts">
	import MarkdownDocument from '#lib/MarkdownDocument.svelte';
	import termsOfUse from '#lib/content/terms-of-use.md?raw';
</script>

<MarkdownDocument markdown={termsOfUse} title="Terms of Use" />
