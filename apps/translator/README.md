# SAPO translator

TanStack Start + Solid 2 app at `/app/` on the existing SAPO website. Desktop has adjacent input/output panes; phones retain paging and the native aesthetic. Local AI, demo access, and web purchases are omitted.

## Development

Use Node 24 and Bun 1.4.0. Install from the **monorepo root**, keeping one root lockfile:

```sh
bun install --frozen-lockfile
cp apps/translator/.env.example apps/translator/.env.local
bun run dev:web
```

Open `http://127.0.0.1:3000/app/`. The SvelteKit site on 3000 proxies `/app/` and its HMR to the translator on 3001. `bun run dev:app` starts only the translator at `http://127.0.0.1:3001/app/`.

Set `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` to the same deployment as mobile. These are public URLs. Add the exact website origin (`http://127.0.0.1:3000` locally) to the existing Convex deployment's comma-separated `CLIENT_ORIGIN`, preserving all existing origins. Allow port 3001 too only if using it directly. Before release, add the production origin. No backend environment is changed by the build.

Google/Apple retain the same Better Auth accounts and backend callbacks. The browser return URL is `/app/`, including the existing cross-domain one-time-token exchange. Convex is authoritative for identity, paid access, and shared quotas. Existing mobile subscriptions apply to the web app; there is no separate allowance.

## Build and deployment

```sh
bun run --filter @sapo/translator typecheck
bun run --filter @sapo/translator test
bun run build:web
```

The website's build compiles this app with Nitro's Vercel preset, then `scripts/build-app.mjs` merges its static assets and server function into `apps/web/.vercel/output`. Deploy the existing website project with Root Directory `apps/web`. Both apps use one origin and deployment. The site's existing pages, Turso endpoints, headers, and Apple association remain in that output. No iframe or second production origin is required.

Vercel must allow build inputs outside `apps/web` for the workspace dependencies and sibling app. Set the two public `VITE_CONVEX_*` URLs in the website Vercel project at build time. Server-only Stripe variables belong in its runtime environment. `bun run build:app` instead emits a standalone Node build under this workspace's `.output/`; `bun run --filter @sapo/translator start` runs it with the `/app/` base.

Start/Router `2.0.0-rc.8`, Solid/web/signals/compiler `2.0.0-rc.8`, and the Solid Vite plugin `3.0.0-next.43` are pinned as a tested group. Upgrade them together and verify hydration. Compiler overrides live in the root package manifest, where Bun workspace overrides are applied.

## Shared code and state

Feature screens live in `src/components`, thin routes in `src/routes`, Solid store factories in `src/stores`, lifecycle in `src/providers`, and integrations in `src/lib`. State is created per provider for SSR isolation. Mobile keeps Zustand. Do not share reactive stores across frameworks.

`@sapo/client-core` contains shared languages, legal URLs, and the streaming transport. `@sapo/backend/api` and `@sapo/backend/constants/*` expose the backend's public client surface. Native streaming tests cover the shared parser's request framing, cancellation, timeouts, errors, and translation/respelling protocols. Assets synchronize from `apps/mobile/assets` before dev/build. No imports point to the former repository.

Preferences persist, but input/output and entitlement claims do not. Auth storage follows the Convex Better Auth cross-domain plugin. Account changes cancel streaming and clear text. Plan information refreshes on focus, account changes, expiration, and realtime backend updates.

The app includes `/app/delete-account?token=…` for explicit deletion confirmation. The existing backend's `DELETE_ACCOUNT_CALLBACK_URL` controls verification emails; preserve mobile/universal-link behavior when configuring it. Account deletion does not cancel store subscriptions.

## PWA

The manifest, start URL, assets, and service worker are under `/app/`. The worker is registered only in production with scope `/app/`, so it cannot control marketing, database, or support pages. It caches only an offline notice and a small static asset allowlist. It never caches app pages, API/auth responses, translation requests, or user text. AI operations require internet access. Updates wait for “Update now.”

## Stripe foundation

`src/lib/stripe.server.ts` contains the server-only SDK client and raw-body webhook signature verification. Optional `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` must never use `VITE_` prefixes.

`POST /app/api/stripe/webhook` intentionally returns **503** while billing is disabled. Do not register a live Stripe destination yet. Checkout, customer mapping, durable webhook deduplication, and shared Stripe/RevenueCat entitlement reconciliation are required before enabling billing. Mobile subscriptions remain authoritative across platforms.

## Verification limits

Automated checks cover OAuth callback exchange, preference validation, scoped service-worker behavior, Stripe signatures, deployment routing, and shared streaming. Live Google/Apple sign-in and paid/free streaming still require allowed origins and corresponding accounts. Run those acceptance checks against the shared development backend before release.
