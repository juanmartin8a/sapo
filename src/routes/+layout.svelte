<script lang="ts">
	import './layout.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href="/sapo-logo.png" />
</svelte:head>
{@render children()}
