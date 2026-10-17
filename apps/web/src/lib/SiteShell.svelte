<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
	const pathname = $derived(page.url.pathname.replace(/\/$/, '') || '/');
</script>

<div class="site-shell">
	<a class="skip-link" href="#main-content">Skip to content</a>
	<header class="site-header">
		<a class="wordmark" href={resolve('/')} aria-label="SAPO home">S A P O</a>
		<nav aria-label="Main navigation">
			<a href="/app/" data-sveltekit-reload>Open app</a>
			<a
				href={resolve('multilingual-phonetic-representations/')}
				aria-current={pathname === '/multilingual-phonetic-representations'
					? 'page'
					: pathname.startsWith('/multilingual-phonetic-representations/')
						? 'location'
						: undefined}>Database</a
			>
			<a
				href={resolve('support/')}
				aria-current={['/support', '/contact-us'].includes(pathname) ? 'page' : undefined}
				>Support</a
			>
		</nav>
	</header>
	<main id="main-content" class="site-main" class:home={pathname === '/'}>
		{@render children()}
	</main>
	<footer class="site-footer">
		<span>© 2026 Happ Technologies Inc.</span>
		<nav aria-label="Footer navigation">
			<a
				href={resolve('terms-of-use/')}
				aria-current={pathname === '/terms-of-use' ? 'page' : undefined}>Terms</a
			>
			<a
				href={resolve('privacy-policy/')}
				aria-current={pathname === '/privacy-policy' ? 'page' : undefined}>Privacy</a
			>
		</nav>
	</footer>
</div>

<style>
	.site-shell {
		width: min(100%, 1120px);
		min-height: 100svh;
		padding: 0 56px;
		margin: auto;
		display: flex;
		flex-direction: column;
		color: var(--ink);
	}
	.skip-link {
		position: absolute;
		top: 12px;
		left: 16px;
		z-index: 1;
		padding: 12px 16px;
		background: white;
		transform: translateY(-200%);
	}
	.skip-link:focus {
		transform: translateY(0);
	}
	.site-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		min-height: 100px;
		gap: 24px;
	}
	.wordmark {
		font-family: var(--serif);
		font-size: 19px;
		font-weight: 700;
		white-space: nowrap;
	}
	nav {
		display: flex;
		align-items: center;
		gap: 28px;
		font-size: 13px;
	}
	.site-header nav {
		color: var(--muted);
	}
	nav a {
		padding: 12px 0;
	}
	.site-main {
		flex: 1;
		padding: 72px 0 88px;
	}

	.site-main.home {
		flex: none;
		margin: auto 0;
	}
	a {
		color: inherit;
		transition: opacity 150ms;
	}
	a:hover {
		opacity: 0.65;
	}
	nav a[aria-current] {
		color: var(--ink);
	}
	.site-footer {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 24px;
		padding: 16px 0 24px;
		color: var(--muted);
		font-size: 11px;
	}
	.site-footer nav {
		margin-left: auto;
		font-size: inherit;
	}

	@media (max-width: 900px) {
		.site-shell {
			padding: 0 36px;
		}
	}
	@media (max-width: 640px) {
		.site-shell {
			padding: 0 24px;
		}
		.site-header {
			min-height: 84px;
			gap: 16px;
		}
		.wordmark {
			font-size: 17px;
		}
		nav {
			gap: 18px;
			font-size: 12px;
		}
		.site-main {
			padding: 32px 0 48px;
		}
		.site-footer {
			gap: 12px;
			font-size: 10px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		a {
			transition: none;
		}
	}
</style>
