<script lang="ts">
	import { onMount } from 'svelte';
	import { waitForFrogImages, waitForFrogTransition } from '$lib/frogTransition';

	let { title, frog = false }: { title: string; frog?: boolean } = $props();
	const words = $derived(title.split(' '));
	let revealed = $state(Infinity);
	let speaking = $state(false);
	let reducedMotion = false;
	let timers: ReturnType<typeof setTimeout>[] = [];

	function stop() {
		timers.forEach(clearTimeout);
		timers = [];
		speaking = false;
		revealed = Infinity;
	}

	function openMouth() {
		if (speaking || reducedMotion || revealed < words.length - 1) return;
		speaking = true;
		timers.push(setTimeout(() => (speaking = false), 200));
	}

	onMount(() => {
		if (!frog) return;
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
				if (disposed || reducedMotion) return;
				words.forEach((_, index) => {
					timers.push(
						setTimeout(
							() => {
								revealed = index;
								speaking = true;
							},
							80 + index * 240
						)
					);
					timers.push(setTimeout(() => (speaking = false), 240 + index * 240));
				});
			});
		motion.addEventListener('change', updateMotion);
		return () => {
			disposed = true;
			stop();
			motion.removeEventListener('change', updateMotion);
		};
	});
</script>

<div class="page-heading" class:with-frog={frog}>
	{#if frog}
		<button
			type="button"
			class="sapo-frog-transition frog"
			class:speaking
			disabled={speaking || revealed < words.length - 1}
			onclick={openMouth}
			aria-label="Make the SAPO frog open its mouth"
		>
			<span class="frog-art">
				<img class="closed" src="/sapo-frog.svg" alt="" width="929" height="800" />
				<img class="open" src="/sapo-frog-open.svg" alt="" width="929" height="914" />
			</span>
		</button>
	{/if}
	<h1 class="page-title" aria-label={title}>
		{#each words as word, index (index)}
			<span aria-hidden="true" class:unspoken={revealed < index}
				>{word + (index < words.length - 1 ? ' ' : '')}</span
			>
		{/each}
	</h1>
</div>

<style>
	.page-heading {
		margin-bottom: 16px;
	}
	.with-frog {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.frog {
		position: relative;
		width: 88px;
		flex-shrink: 0;
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
	.unspoken {
		opacity: 0;
	}
	@media (max-width: 640px) {
		.with-frog {
			max-width: 480px;
			margin: 0 auto 16px;
			justify-content: center;
		}
	}
</style>
