<script lang="ts">
	import { onNavigate } from '$app/navigation';
	import './layout.css';

	let { children } = $props();

	type SapoViewTransition = {
		finished: Promise<void>;
	};

	type ViewTransitionDocument = Document & {
		startViewTransition?: (callback: () => Promise<void>) => SapoViewTransition;
	};

	const frogTransitionRoutes = new Set(['/', '/support', '/delete-account']);
	const normalizeFrogTransitionPath = (path: string) => path.replace(/\/$/, '') || '/';
	const frogTransitionClass = 'sapo-frog-view-transitioning';

	onNavigate((navigation) => {
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

		return new Promise<void>((resolve) => {
			const finishFrogTransition = () => {
				document.documentElement.classList.remove(frogTransitionClass);
			};
			const transition = viewTransitionDocument.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});

			transition.finished.then(finishFrogTransition, finishFrogTransition);
		});
	});
</script>

<svelte:head>
	<link rel="icon" href="/sapo-logo.png" />
	<link rel="preload" as="image" href="/sapo-frog.svg" type="image/svg+xml" fetchpriority="high" />
	<link
		rel="preload"
		as="image"
		href="/sapo-frog-open.svg"
		type="image/svg+xml"
		fetchpriority="high"
	/>
</svelte:head>
{@render children()}
