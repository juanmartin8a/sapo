<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	const acronymFirstLine = ['Sound', 'Adaptation', '&'];
	const acronymSecondLine = ['Phonetic', 'Orchestration'];
	const acronymWords = [...acronymFirstLine, ...acronymSecondLine];

	let animationReady = $state(false);
	let mouthOpen = $state(false);
	let acronymSpeaking = $state(false);
	let wordDelays = $state(acronymWords.map((_, index) => 0.12 + index * 0.2));
	let frogClickTimer: ReturnType<typeof setTimeout> | null = null;
	const endAcronymSpeakingDelay = 260;

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

		wordDelays = acronymWords.map((_, index) => 0.08 + index * 0.22 + Math.random() * 0.08);
		animationReady = true;
		acronymSpeaking = true;

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
					acronymSpeaking = false;
				},
				Math.max(...wordDelays) * 1000 + endAcronymSpeakingDelay
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
	<title>S A P O | Sound Adaptation & Phonetic Orchestration</title>
	<meta
		name="description"
		content="S A P O helps you translate words and hear how they sound in other languages, while supporting an open phonetic dataset."
	/>
</svelte:head>

<main class="relative h-svh overflow-hidden px-4 py-4 text-[#1E3526] sm:px-6 sm:py-5 lg:px-10">
	<div class="relative mx-auto grid h-full w-full max-w-5xl grid-rows-[auto_1fr_auto] gap-3">
		<header class="flex items-center justify-between gap-4">
			<a href={resolve('/')} class="text-sm font-semibold tracking-[0.34em] text-[#1E3526]">
				S&nbsp;A&nbsp;P&nbsp;O
			</a>

			<nav
				class="flex items-center gap-3 text-[0.7rem] font-semibold tracking-[0.2em] text-[#4C6349] uppercase sm:text-xs"
			>
				<a class="transition hover:text-[#1E3526]" href={resolve('/support/')}>Support</a>
			</nav>
		</header>

		<section class="grid min-h-0 grid-rows-[1fr_auto_auto] items-center gap-4">
			<div
				class="mx-auto grid min-h-0 w-full max-w-4xl items-center gap-4 sm:grid-cols-[0.38fr_1.62fr] sm:gap-6"
			>
				<button
					type="button"
					class="sapo-frog-transition relative mx-auto aspect-[929/914] w-[min(62vw,14rem)] sm:w-[min(18vw,15rem)]"
					aria-label="Make the SAPO frog speak"
					disabled={acronymSpeaking}
					onclick={() => {
						if (!acronymSpeaking) {
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

				<div
					class="grid min-h-0 content-center justify-items-center sm:justify-items-start"
					class:words-ready={animationReady}
				>
					<h1
						class="grid gap-1 text-[clamp(1.35rem,6.3vw,3.75rem)] leading-[0.9] font-black tracking-[-0.075em] text-[#1E3526]"
					>
						<span
							class="flex items-baseline justify-center gap-[0.24em] whitespace-nowrap sm:justify-start"
						>
							{#each acronymFirstLine as word, index (word)}
								<span class="sapo-word inline-block" style={`--word-delay: ${wordDelays[index]}s`}>
									{word}
								</span>
							{/each}
						</span>
						<span
							class="flex items-baseline justify-center gap-[0.24em] whitespace-nowrap sm:justify-start"
						>
							{#each acronymSecondLine as word, index (word)}
								<span
									class="sapo-word inline-block"
									style={`--word-delay: ${wordDelays[index + acronymFirstLine.length]}s`}
								>
									{word}
								</span>
							{/each}
						</span>
					</h1>
				</div>
			</div>

			<p
				class="mx-auto max-w-4xl text-center text-sm leading-6 text-[#4C6349] sm:text-base sm:leading-7"
			>
				S&nbsp;A&nbsp;P&nbsp;O helps you translate words and see how they sound in another language.
				It also supports linguistic research with an open phonetic database of phonetic
				respellings for comparing pronunciations across languages. Subscriptions help keep the
				app running and grow the dataset.
			</p>

			<div class="flex flex-wrap items-center justify-center gap-3">
				<a
					class="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2.5 text-xs font-bold text-white shadow-xl shadow-black/15 transition hover:-translate-y-0.5 hover:bg-[#1E3526] sm:px-5 sm:py-3 sm:text-sm"
					href="https://apps.apple.com/us/app/s-a-p-o-transl-ate-iterate/id6752793342"
					target="_blank"
					rel="noreferrer"
				>
					<svg aria-hidden="true" viewBox="0 0 16 20" class="h-4 w-4 fill-current sm:h-5 sm:w-5">
						<path
							d="M12.9 10.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.8C3.5 5.3 1.8 6.2.9 7.6-.8 10.4.5 14.4 2.1 16.7c.8 1.1 1.7 2.4 3 2.3 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8s2.1-1.2 2.9-2.3c.9-1.3 1.2-2.6 1.2-2.7-.1 0-2.6-1-2.6-3.4ZM10.6 3.8c.7-.8 1.1-1.9 1-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.9-1 2.9 1 .1 2-.5 2.7-1.3Z"
						/>
					</svg>
					Download on the App Store
				</a>

				<a
					class="rounded-full border border-[#AFC6A9] bg-white/55 px-4 py-2.5 text-xs font-bold text-[#1E3526] transition hover:-translate-y-0.5 hover:bg-white sm:px-5 sm:py-3 sm:text-sm"
					href={resolve('/support/')}
				>
					Contact support
				</a>
			</div>
		</section>

		<footer
			class="flex items-center justify-center gap-3 text-[0.68rem] font-medium text-[#647C61] sm:justify-end sm:text-xs"
		>
			<div class="flex gap-3">
				<a class="hover:text-[#1E3526]" href={resolve('/terms-of-use/')}>Terms</a>
				<a class="hover:text-[#1E3526]" href={resolve('/privacy-policy/')}>Privacy</a>
			</div>
		</footer>
	</div>
</main>

<style>
	.sapo-word {
		opacity: 0;
		transform: translate3d(0.35rem, 0.9rem, 0) scale(0.98);
	}

	.words-ready .sapo-word {
		animation: word-reveal 360ms cubic-bezier(0.23, 1, 0.32, 1) both;
		animation-delay: var(--word-delay);
	}

	@keyframes word-reveal {
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
		.sapo-word,
		.words-ready .sapo-word {
			animation: none;
			opacity: 1;
			transform: none;
		}
	}
</style>
