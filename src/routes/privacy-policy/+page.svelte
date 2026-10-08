<script lang="ts">
	import MarkdownDocument from '#lib/MarkdownDocument.svelte';
	import privacyPolicy from '#lib/content/privacy-policy.md?raw';
</script>

<MarkdownDocument markdown={privacyPolicy} title="Privacy Policy" />
