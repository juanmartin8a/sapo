# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
bun x sv@0.15.3 create --template minimal --types ts --add prettier eslint tailwindcss="plugins:none" sveltekit-adapter="adapter:vercel" --install bun sapo
```

## Developing

Copy `.env.example` to `.env.local` and set `PUBLIC_CONVEX_URL` to the Convex deployment
that exposes `pronunciations:listLanguages` and `pronunciations:listByLanguagePair`.
The URL is public and embedded at build time; configure it in the build environment
when deploying. No Convex admin key is needed. The `/pronunciations/` page prerenders
its shell and fetches data in the browser.

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
