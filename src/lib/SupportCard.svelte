<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	const supportPhraseLead = ['Need', 'a', 'hand', 'with'];
	const supportPhraseLetters = ['S', 'A', 'P', 'O'];
	const supportPhraseWords = [...supportPhraseLead, ...supportPhraseLetters];

	let animationReady = $state(false);
	let mouthOpen = $state(false);
	let supportPhraseSpeaking = $state(false);
	let wordDelays = $state(supportPhraseWords.map((_, index) => 0.12 + index * 0.2));
	let frogClickTimer: ReturnType<typeof setTimeout> | null = null;
	const endSupportPhraseSpeakingDelay = 260;

	const openFrogMouthBriefly = (duration = 80 + Math.random() * 120) => {
		if (frogClickTimer) {
			clearTimeout(frogClickTimer);
		}

		mouthOpen = true;
		frogClickTimer = setTimeout(() => {
			mouthOpen = false;
			frogClickTimer = null;
		}, duration);
	};

	onMount(() => {
		const timers: ReturnType<typeof setTimeout>[] = [];

		wordDelays = supportPhraseWords.map((_, index) => 0.08 + index * 0.22 + Math.random() * 0.08);
		animationReady = true;
		supportPhraseSpeaking = true;

		wordDelays.forEach((delay) => {
			timers.push(
				setTimeout(() => {
					openFrogMouthBriefly(135);
				}, delay * 1000)
			);
		});

		timers.push(
			setTimeout(
				() => {
					supportPhraseSpeaking = false;
				},
				Math.max(...wordDelays) * 1000 + endSupportPhraseSpeakingDelay
			)
		);

		return () => {
			timers.forEach(clearTimeout);
			if (frogClickTimer) {
				clearTimeout(frogClickTimer);
			}
		};
	});
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
			class="mx-auto grid w-full max-w-3xl items-center gap-4 self-center sm:grid-cols-[0.36fr_0.64fr] sm:gap-10"
		>
			<button
				type="button"
				class="sapo-frog-transition relative mx-auto aspect-[929/914] w-[min(48vw,11rem)] sm:w-full"
				aria-label="Make the SAPO frog speak"
				disabled={supportPhraseSpeaking}
				onclick={() => {
					if (!supportPhraseSpeaking) {
						openFrogMouthBriefly();
					}
				}}
			>
				<div class="absolute inset-0">
					<img
						src="/sapo-frog.svg"
						alt="SAPO frog"
						class="absolute bottom-0 left-0 h-auto w-full transition-opacity duration-75"
						style:opacity={mouthOpen ? 0 : 1}
					/>
					<img
						src="/sapo-frog-open.svg"
						alt=""
						class="absolute bottom-0 left-0 h-auto w-full transition-opacity duration-75"
						style:opacity={mouthOpen ? 1 : 0}
					/>
				</div>
			</button>

			<div class="text-center sm:text-left">
				<p
					class="mb-3 text-[0.68rem] font-bold tracking-[0.28em] text-[#647C61] uppercase sm:text-xs"
				>
					Support
				</p>

				<h1
					class="flex flex-wrap justify-center gap-x-[0.18em] gap-y-1 text-4xl leading-none font-black tracking-[-0.06em] sm:justify-start sm:text-6xl"
					class:support-words-ready={animationReady}
				>
					{#each supportPhraseLead as word, index (word)}
						<span class="support-word inline-block" style={`--word-delay: ${wordDelays[index]}s`}>
							{word}
						</span>
					{/each}
					<span class="inline-flex gap-x-[0.18em] whitespace-nowrap">
						{#each supportPhraseLetters as letter, index (letter)}
							<span
								class="support-word inline-block"
								style={`--word-delay: ${wordDelays[index + supportPhraseLead.length]}s`}
							>
								{letter}
							</span>
						{/each}
						<span
							class="support-word inline-block"
							style={`--word-delay: ${wordDelays[supportPhraseWords.length - 1] + 0.08}s`}
						>
							?
						</span>
					</span>
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

<style>
	.support-word {
		opacity: 0;
		transform: translate3d(0.35rem, 0.9rem, 0) scale(0.98);
	}

	.support-words-ready .support-word {
		animation: support-word-reveal 360ms cubic-bezier(0.23, 1, 0.32, 1) both;
		animation-delay: var(--word-delay);
	}

	@keyframes support-word-reveal {
		from {
			opacity: 0;
			transform: translate3d(0.35rem, 0.9rem, 0) scale(0.98);
		}

		to {
			opacity: 1;
			transform: translate3d(0, 0, 0) scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.support-word,
		.support-words-ready .support-word {
			animation: none;
			opacity: 1;
			transform: none;
		}
	}
</style>
