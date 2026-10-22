# SAPO web

One TanStack Start + Solid 2 application serves the website and translator at
`/app/` and its installable PWA at `/pwa/`. Public pages are prerendered; API routes and translator pages use SSR.

## Development

Use Node 24 and Bun 1.4.0. Install from the monorepo root:

```sh
bun install --frozen-lockfile
cp apps/web/.env.example apps/web/.env.local
bun run dev:web
```

Open `http://127.0.0.1:3000/` or `/app/` (responsive web) and `/pwa/` (PWA). There is one Vite server and one router.
Set private `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` for the database and public
`VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` to the same deployment as mobile.
Local settings from the former translator workspace belong in this workspace now.

Add the website's exact origin to the existing Convex deployment's `CLIENT_ORIGIN`,
preserving its other origins. Google/Apple continue to use Better Auth accounts,
backend callbacks, and the `/app/auth-callback/` or `/pwa/auth-callback/` return URL with the cross-domain token exchange.

Web authentication uses the same Convex deployment through `/app/api/auth/*`.
The proxy stores HttpOnly cookies scoped to `/app` and `/pwa`; the backend's existing OAuth
callbacks and mobile authentication remain unchanged. An HttpOnly browser nonce
binds each web OAuth callback to the browser that initiated it.

On `/app/` and `/pwa/` requests, the server verifies the cached Convex profile JWT against
Convex's public keys and includes only profile fields in the initial HTML. Public
keys are cached; profile data is isolated to each request. Missing or expired JWTs
are refreshed once through Better Auth when a session cookie exists. No server
secrets are copied from Convex, and personalized pages/auth responses use
`private, no-store`. Internal links use client navigation so the root auth provider
retains its account when moving between the translator and public pages. The client
coalesces background session checks and revalidates on focus only after five minutes.
Convex subscriptions and backend checks remain authoritative for plan access.
Existing cross-domain browser sessions migrate once after server validation;
their old localStorage credentials are removed after migration or sign-out.
No backend environment is changed by a build.

## Structure

- `src/routes`: thin file routes, the root document, public `_site` layout, and `/app`/`/pwa` layouts.
- `src/components`: website UI in `site/` and translator feature screens beside it.
- `src/stores`, `src/providers`: per-instance Solid state and translator lifecycle.
- `src/lib`: integrations, Markdown rendering, and private database code in `server/`.
- `src/lib/content`: unchanged legal Markdown and database notices.
- `public`: website assets; shared translator assets live under `public/app/`; PWA install assets live under `public/pwa/`.

The shared site header uses the same component in the website and desktop
translator. Translator providers mount only within `/app/` and `/pwa/`. Styles are scoped to
website and translator containers. State is never shared between SSR requests.

## Database

Use the same **libSQL database** populated by `~/development/js/sapo-mpr`.
Its `database/schema.sql` defines the tables and indexes used by this website.
The website only reads existing data; it never creates tables or writes to them.
Obtain the URL with `turso db show <database-name> --url` and create a separate
website token with `turso db tokens create <database-name> --read-only`.
See [Turso's TypeScript SDK docs](https://docs.turso.tech/sdk/ts/quickstart) and
[read-only tokens](https://docs.turso.tech/cli/db/tokens/create).

Keep both Turso variables private and available only to the website's server.

The pages remain prerendered. The pronunciation browser calls the same-origin
`/api/languages` and `/api/pronunciations?source=en&target=es` endpoints, which
query Turso on the server through `@libsql/client/http`. Pronunciations use a fixed
25-row page and a pair-bound `cursor` returned as `nextCursor` (null on the last
page). Words are ordered alphabetically using SQLite's existing `BINARY` collation
(case-sensitive, without locale-specific accent folding), with entry and respelling
IDs breaking ties. Pagination seeks by `(orthographic_form, entry_id, respelling_id)`
using the existing `entries_by_language_and_orth` and
`pronunciation_respellings_by_entry` indexes. Only variants within an individual
entry need sorting; the query does not sort the entire language pair, scan an
offset, or count all rows. Sparse target-language coverage can require checking
more entries to fill a page. No schema changes or write permissions are needed.
It is a live view, not a database snapshot: inserts after the cursor can appear on
subsequent pages; inserts before it require restarting browsing. Renaming words
while browsing can move them across the cursor. Old timestamp cursors are rejected.

Successful API responses cache in the browser for 60 seconds and in shared caches
for 5 minutes (pronunciations) or 1 hour (languages), with 60 seconds of stale
revalidation. Errors are not cached and never expose upstream SDK messages.
Database HTTP requests time out after 8 seconds and reject redirects. Each server
instance admits at most 20 concurrent reads; excess requests receive an uncached
503 with `Retry-After: 1` rather than waiting in an unbounded SDK queue. Browser
requests have a 15-second deadline and cancel when their filters change.

## Build and verification

```sh
bun run typecheck
bun run lint
bun run test
bun run prompts:check
bun run build:web
bun run --filter @sapo/web verify:build
```

Deploy the existing Vercel project with Root Directory `apps/web`, Framework Preset
**Other**, build command `bun run build`, install command `bun install --frozen-lockfile`,
and access to workspace inputs outside the root directory. Nitro emits one
`.vercel/output` artifact targeting Node 24. No custom merge script is required.
The production build verifies preserved copy, assets, deployment routing, and
server response behavior before succeeding. A small Nitro module compensates
for the pinned preset’s terminal `/app/` and `/pwa/` header rules so dynamic routes reach SSR.
Set public Convex URLs at build time and private Turso variables at runtime. Stripe billing remains disabled; its webhook rejects events until billing is implemented.
The build does not need a database connection. `bun run --filter @sapo/web preview`
previews the production build on port 4173. `bun run build:app` creates a Node
build under `apps/web/.output`; `bun run --filter @sapo/web start` serves it.

Start/Router and Solid are pinned to `2.0.0-rc.8` with the matching compiler
versions and Solid Vite plugin `3.0.0-next.43`. Upgrade this group together and
verify hydration; compiler overrides live in the root manifest.

## Translator and PWA

The translator shares mobile accounts, subscription access, quotas, and streaming
through Convex and `@sapo/client-core`. Preferences persist; input/output and paid
access claims do not. Auth/account changes cancel streaming and clear text.

Shared translator images and SVGs synchronize from `apps/mobile/assets` before
dev/build. `/app/` is a responsive web page: input and output sit side by side on
wide screens and stack on small screens. It has no manifest, installation UI,
or service worker registration. `/app/sw.js` only retires the previous worker.

The PWA manifest, icons, offline notice, start URL, and service worker live under
`/pwa/`. It uses a dedicated app shell on every device, with paged input/output,
a sidebar, and the single-screen option. Website navigation and the public footer
are exclusive to `/app/` and public pages.
Account links and OAuth returns remain within `/pwa/`; authentication uses the
shared `/app/api/auth/*` proxy and session. Links from the PWA to public pages
load a separate document. The worker caches only an offline notice and a small
static asset allowlist, never user pages or API/auth responses. Updates wait for
“Update now.” AI operations require internet access.

`/app/delete-account?token=…` provides explicit deletion confirmation. Preserve the
backend's `DELETE_ACCOUNT_CALLBACK_URL` and mobile/universal-link behavior.
Account deletion does not cancel store subscriptions.

Optional `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are server-only.
`POST /app/api/stripe/webhook` returns 503 while billing is disabled. Do not register
a live destination or enable checkout before implementing customer mapping,
durable deduplication, and shared entitlement reconciliation.

Tests cover OAuth exchange, preferences, worker scope, Stripe signatures, database
behavior, and content preservation. Live sign-in and paid/free translation require
allowed origins and corresponding accounts for acceptance testing.
