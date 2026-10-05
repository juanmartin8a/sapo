<script lang="ts">
	import { resolve } from '$app/paths';
	import PageHeading from '$lib/PageHeading.svelte';
</script>

<svelte:head>
	<title>Support | S A P O</title>
	<meta name="description" content="Contact S A P O support." />
</svelte:head>

<section aria-label="Support">
	<PageHeading title="Need a hand with SAPO?" frog />
	<p class="page-intro">
		Leave us an email at <a href="mailto:support@sapo.surf?subject=SAPO%20Support"
			>support@sapo.surf</a
		>.
	</p>
	<div class="resource-section">
		<a class="resource-link" href="mailto:support@sapo.surf?subject=SAPO%20Support"
			>Email support <span aria-hidden="true">↗</span></a
		>
		<a class="resource-link" href={resolve('/delete-account/')}
			>Account deletion <span aria-hidden="true">→</span></a
		>
	</div>
</section>

<style>
	.resource-section {
		display: flex;
		flex-wrap: wrap;
		gap: 16px 40px;
	}
</style>
