<script lang="ts">
	import { onNavigate } from '$app/navigation';
	import './layout.css';
	import SiteShell from '$lib/SiteShell.svelte';
	import { beginFrogTransition, waitForFrogImages } from '$lib/frogTransition';

	let { children } = $props();

	type SapoViewTransition = {
		finished: Promise<void>;
		skipTransition: () => void;
	};

	type ViewTransitionDocument = Document & {
		startViewTransition?: (callback: () => Promise<void>) => SapoViewTransition;
	};

	const frogTransitionRoutes = new Set(['/', '/support', '/contact-us', '/delete-account']);
	const normalizeFrogTransitionPath = (path: string) => path.replace(/\/$/, '') || '/';
	const frogTransitionClass = 'sapo-frog-view-transitioning';
	let currentTransition: SapoViewTransition | undefined;

	onNavigate((navigation) => {
		// A rapid second navigation must not inherit or clean up the previous transition.
		currentTransition?.skipTransition();
		currentTransition = undefined;
		document.documentElement.classList.remove(frogTransitionClass);
		const fromPath = navigation.from?.url.pathname
			? normalizeFrogTransitionPath(navigation.from.url.pathname)
			: undefined;
		const toPath = navigation.to?.url.pathname
			? normalizeFrogTransitionPath(navigation.to.url.pathname)
			: undefined;

		if (
			!fromPath ||
			!toPath ||
			fromPath === toPath ||
			!frogTransitionRoutes.has(fromPath) ||
			!frogTransitionRoutes.has(toPath) ||
			window.matchMedia('(prefers-reduced-motion: reduce)').matches
		) {
			return;
		}

		const viewTransitionDocument = document as ViewTransitionDocument;

		if (!viewTransitionDocument.startViewTransition) {
			return;
		}

		document.documentElement.classList.add(frogTransitionClass);

		const releaseFrogAnimation = beginFrogTransition();
		return new Promise<void>((resolve) => {
			const transition = viewTransitionDocument.startViewTransition(async () => {
				resolve();
				await navigation.complete;
				// These SVGs contain raster images. Wait for decoding before the new snapshot.
				await waitForFrogImages();
			});
			currentTransition = transition;
			const finishFrogTransition = () => {
				if (currentTransition === transition) {
					document.documentElement.classList.remove(frogTransitionClass);
					currentTransition = undefined;
				}
				releaseFrogAnimation();
			};
			transition.finished.then(finishFrogTransition, finishFrogTransition);
		});
	});
</script>

<svelte:head>
	<link rel="icon" href="/sapo-favicon.svg" type="image/svg+xml" />
	<link rel="preload" as="image" href="/sapo-frog.svg" type="image/svg+xml" fetchpriority="high" />
	<link
		rel="preload"
		as="image"
		href="/sapo-frog-open.svg"
		type="image/svg+xml"
		fetchpriority="high"
	/>
</svelte:head>
<SiteShell>{@render children()}</SiteShell>
