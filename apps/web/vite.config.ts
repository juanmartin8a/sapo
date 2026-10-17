import adapter from '@sveltejs/adapter-vercel';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	server: {
		host: '127.0.0.1',
		port: 3000,
		strictPort: true,
		proxy: {
			'^/app(?:/|$)': { target: 'http://127.0.0.1:3001', ws: true }
		}
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ runtime: 'nodejs24.x' }),
			prerender: {
				entries: ['*'],
				handleHttpError: ({ path, status, message }) => {
					// /app belongs to the sibling TanStack build, merged after this build.
					if (path === '/app/' && status === 404) return;
					throw new Error(message);
				}
			}
		})
	]
});
