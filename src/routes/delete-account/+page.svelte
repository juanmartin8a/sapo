<script lang="ts">
	import { resolve } from '$app/paths';
	import PageHeading from '$lib/PageHeading.svelte';
</script>

<svelte:head>
	<title>Delete Account | S A P O</title>
	<meta
		name="description"
		content="Learn how to delete your SAPO account from the app or contact SAPO support for help."
	/>
</svelte:head>

<section aria-label="Account deletion">
	<PageHeading title="Delete your SAPO account" frog />
	<div class="page-prose">
		<p>
			To delete your SAPO account, open the SAPO app and go to
			<strong> Settings &rarr; Data Controls &rarr; Delete account</strong>.
		</p>

		<p>
			If you opened this page from a deletion email and SAPO is installed, try opening the link from
			your email again.
		</p>

		<p>
			To request deletion outside the app, including if you cannot access your account, email
			<a href="mailto:support@sapo.surf?subject=SAPO%20Account%20Deletion"> support@sapo.surf</a>.
			Include the email address associated with your SAPO account. We may need to verify your
			identity before deleting account data.
		</p>

		<p>
			Deletion removes your account and authentication data and starts background cleanup of
			associated subscription, usage, and quota records. Limited subscription identifiers and quota
			counters may remain to prevent quota resets; frozen records become eligible for cleanup 60
			days after the quota period ends. Provider records, backups, and records needed for security,
			legal obligations, or deletion recovery may remain as explained in our
			<a href={resolve('/privacy-policy/')}>Privacy Policy</a>. Contact support to check the status
			of a deletion request.
		</p>

		<p>
			<strong>Account deletion does not cancel a subscription.</strong>
			Manage or cancel billing through Apple or Google Play. You can request account deletion without
			first canceling. Remove downloaded models separately in Settings &rarr; Local models.
		</p>
	</div>
	<div class="resource-section">
		<a class="resource-link" href="mailto:support@sapo.surf?subject=SAPO%20Account%20Deletion"
			>Email support <span aria-hidden="true">↗</span></a
		>
	</div>
</section>
