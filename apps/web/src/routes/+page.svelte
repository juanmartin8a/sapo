<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { waitForFrogImages, waitForFrogTransition } from '#lib/frogTransition.js';

	const lines = [
		[
			{ text: 'Sound', index: 0 },
			{ text: 'Adaptation', index: 1 }
		],
		[
			{ text: '&', index: 2 },
			{ text: 'Phonetic', index: 3 },
			{ text: 'Orchestration', index: 4 }
		]
	];
	let revealed = $state(4);
	let speaking = $state(false);
	let reducedMotion = false;
	let timers: ReturnType<typeof setTimeout>[] = [];
	function stop() {
		timers.forEach(clearTimeout);
		timers = [];
		speaking = false;
		revealed = 4;
	}
	function openMouth() {
		if (speaking || revealed < 4) return;
		stop();
		speaking = true;
		timers.push(setTimeout(() => (speaking = false), 200));
	}
	function recite() {
		stop();
		if (reducedMotion) return;
		// Reveal each word on its mouth opening, with brief pauses at a conversational pace.
		revealed = -1;
		[220, 420, 180, 320, 440].reduce((elapsed, duration, index) => {
			timers.push(
				setTimeout(() => {
					revealed = index;
					speaking = true;
				}, elapsed)
			);
			timers.push(
				setTimeout(
					() => {
						speaking = false;
					},
					elapsed + duration - 65
				)
			);
			return elapsed + duration;
		}, 80);
	}
	onMount(() => {
		let disposed = false;
		const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updateMotion = () => {
			reducedMotion = motion.matches;
			if (reducedMotion) stop();
		};
		updateMotion();
		if (!reducedMotion) revealed = -1;
		void waitForFrogImages()
			.then(waitForFrogTransition)
			.then(() => {
				if (!disposed) recite();
			});
		motion.addEventListener('change', updateMotion);
		return () => {
			disposed = true;
			stop();
			motion.removeEventListener('change', updateMotion);
		};
	});
</script>

<svelte:head>
	<title>SAPO — Phonetic respelling</title>
	<meta
		name="description"
		content="SAPO offers a multilingual phonetic representations database and mobile and web apps for translation and cross-lingual pronunciation respelling."
	/>
</svelte:head>

<section class="hero" aria-labelledby="project-name">
	<div class="hero-copy">
		<div class="project-identity">
			<button
				type="button"
				class="sapo-frog-transition frog"
				class:speaking
				disabled={speaking || revealed < 4}
				onclick={openMouth}
				aria-label="Make the SAPO frog open its mouth"
			>
				<span class="frog-art">
					<img class="closed" src="/sapo-frog.svg" alt="" width="929" height="800" />
					<img class="open" src="/sapo-frog-open.svg" alt="" width="929" height="914" />
				</span>
			</button>
			<h1
				id="project-name"
				class="project-name"
				aria-label="Sound Adaptation and Phonetic Orchestration"
			>
				{#each lines as line, row (row)}
					<span class="name-line" aria-hidden="true">
						{#each line as word (word.text)}
							<span class="name-word" class:unspoken={revealed < word.index}>{word.text}</span>
						{/each}
					</span>
				{/each}
			</h1>
		</div>
		<p class="mission">
			SAPO aims to bridge language gaps by making pronunciation across languages easier and more
			intuitive through phonetic representation. These representations can include
			<a
				href="https://en.wikipedia.org/wiki/Phonetic_transcription"
				target="_blank"
				rel="noopener noreferrer">phonetic transcription</a
			>, but SAPO focuses primarily on cross-lingual
			<a
				href="https://en.wikipedia.org/wiki/Pronunciation_respelling"
				target="_blank"
				rel="noopener noreferrer">pronunciation respelling</a
			>—writing words as they sound using the spelling patterns of another language.
		</p>
	</div>
</section>

<section class="destinations" aria-label="Available resources">
	<article class="destination">
		<h2>Multilingual phonetic representations</h2>
		<p>
			A database containing phonetic transcriptions and pronunciation respellings across languages,
			available for language learning and linguistic research.
		</p>

		<a class="resource-link" href={resolve('multilingual-phonetic-representations/')}>
			Browse the database
			<span aria-hidden="true">↗</span>
		</a>
	</article>
	<article class="destination app-destination">
		<h2>Tools</h2>
		<p>
			Translate and respell in your browser or with the iOS app. The mobile app also offers optional
			local models for offline use.
			<br />
			<br />
			An Android version and more tools are coming soon.
		</p>
		<a class="resource-link" href="/app/" data-sveltekit-reload
			>Open web app <span aria-hidden="true">→</span></a
		>
		<a
			class="resource-link"
			href="https://apps.apple.com/us/app/s-a-p-o-transl-ate-iterate/id6752793342"
			target="_blank"
			rel="noreferrer"
		>
			View on the App Store <span aria-hidden="true">↗</span>
		</a>
	</article>
</section>

<style>
	.project-identity {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: 16px;
	}
	.project-name {
		display: flex;
		flex-wrap: wrap;
		gap: 0 0.3em;
		margin: 0;
		min-width: 0;
		color: var(--ink);
		font-family: 'Times New Roman', Times, serif;
		font-size: clamp(28px, 3vw, 36px);
		font-weight: 400;
		line-height: 1.04;
		letter-spacing: -0.055em;
	}
	.name-line {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 0 0.3em;
	}
	.name-word.unspoken {
		opacity: 0;
	}
	.mission {
		text-align: left;
		max-width: 760px;
		margin: 0;
		color: var(--muted);
		font-size: 17px;
		line-height: 1.75;
	}
	.mission a {
		color: #0645ad;
		text-decoration: none;
		text-decoration-thickness: 1px;
		text-underline-offset: 3px;
	}
	.mission a:hover {
		opacity: 1;
		text-decoration-line: underline;
	}
	.frog {
		width: 88px;
		flex-shrink: 0;
		position: relative;
		cursor: pointer;
		overflow: visible;
		contain: none;
	}
	.frog-art {
		display: block;
		position: relative;
		aspect-ratio: 929 / 914;
	}
	.frog img {
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		height: auto;
	}
	.open,
	.speaking .closed {
		visibility: hidden;
	}
	.speaking .open {
		visibility: visible;
	}
	.destinations {
		display: grid;
		grid-template-columns: 1fr 1fr;
		margin-top: 48px;
		padding-top: 32px;
		border-top: 1px solid var(--line);
	}
	.destination {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		padding-right: 48px;
	}
	.app-destination {
		padding-right: 0;
		padding-left: 48px;
		border-left: 1px solid var(--line);
	}
	h2 {
		margin: 0;
		font-family: 'Times New Roman', Times, serif;
		font-size: clamp(20px, 2vw, 24px);
		font-weight: 400;
		line-height: 1.15;
		letter-spacing: -0.045em;
	}
	.destination p {
		margin: 12px 0 18px;
		color: var(--muted);
		font-size: 15px;
		line-height: 1.75;
	}
	.resource-link {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		font-size: 14px;
		font-weight: 400;
		text-decoration: underline;
		text-decoration-color: #b4bcb1;
		text-underline-offset: 5px;
	}
	.resource-link span {
		font-size: 18px;
	}
	a {
		color: inherit;
		transition: opacity 150ms;
	}
	a:hover {
		opacity: 0.65;
	}
	@media (max-width: 900px) {
		.project-name {
			font-size: clamp(26px, 3.8vw, 32px);
		}
		.destination {
			padding-right: 28px;
		}
		.app-destination {
			padding-right: 0;
			padding-left: 28px;
		}
	}
	@media (max-width: 640px) {
		.project-identity {
			justify-content: center;
			max-width: 480px;
			margin: 0 auto 16px;
		}
		.project-name {
			font-size: clamp(24px, 4.5vw, 28px);
			text-align: left;
		}
		.mission {
			margin: 0;
			font-size: 15px;
		}
		.destinations {
			grid-template-columns: 1fr;
			margin-top: 40px;
			padding-top: 28px;
			gap: 28px;
		}
		.destination {
			padding: 0;
		}
		.app-destination {
			border-left: 0;
			border-top: 1px solid var(--line);
			padding-top: 28px;
		}
		.destination p {
			margin: 12px 0 16px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		a {
			transition: none;
		}
	}
</style>
