<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	const titleLeadWords = ['Delete', 'your'];
	const titleLetters = ['S', 'A', 'P', 'O'];
	const titleTailWords = ['account'];
	const titleParts = [...titleLeadWords, ...titleLetters, ...titleTailWords];

	let animationReady = $state(false);
	let mouthOpen = $state(false);
	let titleSpeaking = $state(false);
	let wordDelays = $state(titleParts.map((_, index) => 0.12 + index * 0.2));
	let frogClickTimer: ReturnType<typeof setTimeout> | null = null;
	const endTitleSpeakingDelay = 260;

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

		wordDelays = titleParts.map((_, index) => 0.08 + index * 0.22 + Math.random() * 0.08);
		animationReady = true;
		titleSpeaking = true;

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
					titleSpeaking = false;
				},
				Math.max(...wordDelays) * 1000 + endTitleSpeakingDelay
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
	<title>Delete Account | S A P O</title>
	<meta
		name="description"
		content="Learn how to delete your SAPO account from the app or contact SAPO support for help."
	/>
</svelte:head>

<main class="min-h-svh px-4 py-4 text-[#1E3526] sm:px-6 sm:py-5 lg:px-10">
	<div
		class="mx-auto grid min-h-[calc(100svh-2rem)] w-full max-w-5xl grid-rows-[auto_1fr_auto] gap-3 sm:min-h-[calc(100svh-2.5rem)]"
	>
		<header class="flex items-center justify-between gap-4">
			<a href={resolve('/')} class="text-sm font-semibold tracking-[0.34em] text-[#1E3526]">
				S&nbsp;A&nbsp;P&nbsp;O
			</a>

			<nav
				class="flex items-center gap-3 text-[0.7rem] font-semibold tracking-[0.2em] text-[#4C6349] uppercase sm:text-xs"
			>
				<a class="transition hover:text-[#1E3526]" href={resolve('/')}>Home</a>
				<a class="transition hover:text-[#1E3526]" href={resolve('/support/')}>Support</a>
			</nav>
		</header>

		<section
			class="grid min-h-0 grid-rows-[auto_auto_auto] items-center gap-5 self-center py-8 sm:py-10"
		>
			<div
				class="mx-auto grid w-full max-w-4xl items-center gap-4 sm:grid-cols-[0.34fr_1.66fr] sm:gap-8"
			>
				<button
					type="button"
					class="sapo-frog-transition relative mx-auto aspect-[929/914] w-[min(52vw,12rem)] sm:w-full"
					aria-label="Make the SAPO frog speak"
					disabled={titleSpeaking}
					onclick={() => {
						if (!titleSpeaking) {
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
						Account deletion
					</p>

					<h1
						class="flex flex-wrap justify-center gap-x-[0.18em] gap-y-1 text-4xl leading-none font-black tracking-[-0.06em] sm:justify-start sm:text-6xl"
						class:delete-words-ready={animationReady}
					>
						{#each titleLeadWords as word, index (word)}
							<span class="delete-word inline-block" style={`--word-delay: ${wordDelays[index]}s`}>
								{word}
							</span>
						{/each}
						<span class="whitespace-nowrap">
							{#each titleLetters as letter, index (letter)}
								<span
									class="delete-word inline-block"
									style={`--word-delay: ${wordDelays[index + titleLeadWords.length]}s`}
								>
									{letter}
								</span>{#if index < titleLetters.length - 1}&nbsp;{/if}
							{/each}
						</span>
						{#each titleTailWords as word, index (word)}
							<span
								class="delete-word inline-block"
								style={`--word-delay: ${wordDelays[index + titleLeadWords.length + titleLetters.length]}s`}
							>
								{word}
							</span>
						{/each}
					</h1>
				</div>
			</div>

			<div
				class="mx-auto grid max-w-4xl gap-3 text-center text-sm leading-6 text-[#4C6349] sm:text-base sm:leading-7"
			>
				<p>
					To delete your SAPO account, open the SAPO app and go to
					<strong class="font-bold text-[#1E3526]">
						Settings &rarr; Data Controls &rarr; Delete account</strong
					>.
				</p>

				<p>
					If you opened this page from a deletion email and SAPO is installed, try opening the link
					from your email again.
				</p>

				<p>
					If you cannot access the app or your account, email
					<a
						class="font-bold text-[#1E3526] underline underline-offset-4"
						href="mailto:support@sapo.surf?subject=SAPO%20Account%20Deletion"
					>
						support@sapo.surf</a
					>. Include the email address associated with your SAPO account. We may need to verify your
					identity before deleting account data.
				</p>
			</div>

			<div class="flex justify-center">
				<a
					class="inline-flex rounded-full bg-black px-5 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#1E3526]"
					href="mailto:support@sapo.surf?subject=SAPO%20Account%20Deletion"
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
	.delete-word {
		opacity: 0;
		transform: translate3d(0.35rem, 0.9rem, 0) scale(0.98);
	}

	.delete-words-ready .delete-word {
		animation: delete-word-reveal 360ms cubic-bezier(0.23, 1, 0.32, 1) both;
		animation-delay: var(--word-delay);
	}

	@keyframes delete-word-reveal {
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
		.delete-word,
		.delete-words-ready .delete-word {
			animation: none;
			opacity: 1;
			transform: none;
		}
	}
</style>
