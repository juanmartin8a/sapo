<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>Support | S A P O</title>
	<meta name="description" content="Contact S A P O support." />
</svelte:head>

<main
	class="min-h-svh px-4 py-4 text-[#1E3526] sm:px-6 sm:py-5 lg:px-10"
	style="background: radial-gradient(circle at 10% 18%, rgba(225, 236, 221, 0.78), transparent 23rem), radial-gradient(circle at 96% 88%, rgba(197, 216, 192, 0.5), transparent 26rem), #ffffff;"
>
	<div
		class="mx-auto grid min-h-[calc(100svh-2rem)] w-full max-w-5xl grid-rows-[auto_1fr_auto] gap-3 sm:min-h-[calc(100svh-2.5rem)]"
	>
		<header class="flex items-center justify-between gap-4">
			<a href={resolve('/')} class="text-sm font-semibold tracking-[0.34em] text-[#1E3526]">
				S&nbsp;A&nbsp;P&nbsp;O
			</a>

			<nav class="text-[0.7rem] font-semibold tracking-[0.2em] text-[#4C6349] uppercase sm:text-xs">
				<a class="transition hover:text-[#1E3526]" href={resolve('/')}>Home</a>
			</nav>
		</header>

		<section
			class="mx-auto grid w-full max-w-3xl items-center gap-6 sm:grid-cols-[0.36fr_0.64fr] sm:gap-10"
		>
			<img src="/sapo-frog.svg" alt="SAPO frog" class="mx-auto w-[min(48vw,11rem)] sm:w-full" />

			<div class="text-center sm:text-left">
				<p
					class="mb-3 text-[0.68rem] font-bold tracking-[0.28em] text-[#647C61] uppercase sm:text-xs"
				>
					Support
				</p>

				<h1 class="text-4xl leading-none font-black tracking-[-0.06em] sm:text-6xl">
					Need a hand with S&nbsp;A&nbsp;P&nbsp;O?
				</h1>

				<p class="mt-5 max-w-md text-base leading-7 text-[#4C6349]">
					Leave us an email at
					<a
						class="font-bold text-[#1E3526] underline underline-offset-4"
						href="mailto:juanmarzabala8a@gmail.com?subject=SAPO%20Support"
					>
						juanmarzabala8a@gmail.com</a
					>.
				</p>

				<a
					class="mt-7 inline-flex rounded-full bg-black px-5 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#1E3526]"
					href="mailto:juanmarzabala8a@gmail.com?subject=SAPO%20Support"
				>
					Email support
				</a>
			</div>
		</section>

		<footer
			class="flex justify-center gap-3 text-[0.68rem] font-medium text-[#647C61] sm:justify-end sm:text-xs"
		>
			<a class="hover:text-[#1E3526]" href={resolve('/terms-of-use/')}>Terms</a>
			<a class="hover:text-[#1E3526]" href={resolve('/privacy-policy/')}>Privacy</a>
		</footer>
	</div>
</main>
