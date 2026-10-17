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

Use Node.js 24.21.0 (pinned in `.nvmrc`) with Bun as the package manager.
The `package.json` engine selects Node.js 24.x for Vercel builds.

```sh
nvm install
nvm use
bun install
```

Copy `.env.example` to `.env.local` and set these private runtime variables, locally
and in the Vercel environments where you deploy:

```dotenv
TURSO_DATABASE_URL=libsql://your-database-your-organization.turso.io
TURSO_AUTH_TOKEN=your-read-only-database-token
```

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

Once you've installed dependencies, start a development server:

```sh
bun run dev:web # from the monorepo root

# or start the server and open the app in a new browser tab
bun run dev --open
```

## Database documentation and attribution

The browser links to `/multilingual-phonetic-representations/about/`, which explains
the database, generation process, limitations, and CC BY-SA 4.0 data license.
Full upstream credits are published at
`/multilingual-phonetic-representations/about/attribution/`. These pages are
prerendered using the existing Markdown document component. Their sources are
`src/lib/content/database-about.md` and `src/lib/content/database-attribution.md`.

The attribution source is adapted from `ATTRIBUTION.md` in `sapo-mpr`. Keep its
upstream notices and provenance details synchronized when the database attribution
changes. Website links replace repository-relative links, and list items stay on
one source line because the Markdown renderer does not support list continuations.

Successful responses from both database API endpoints include a `Link` header
with `rel="license"` pointing to CC BY-SA 4.0 and `rel="describedby"` pointing to
the public attribution page. JSON response shapes are unchanged. When distributing
database exports, retain the attribution, include the license or a link to it, and
identify any changes to the data.

## Building

To create a production version of your app:

```sh
bun run build
```

You can preview the production build with `bun run preview`.

Deploy with the configured Vercel adapter (Node.js 24). The output is
`.vercel/output`, containing static pages and backend functions; a static-only
host cannot run the database endpoints. Builds do not require Turso credentials
or database connectivity. Set the two variables in Vercel's runtime environment.

## Verification

```sh
bun run check
bun run lint
bun run test
bun run build
```

Database tests run against an in-memory database and do not need credentials.

## Translator application

The website links to `/app/`, implemented in the sibling `apps/translator`
workspace with TanStack Start + Solid 2. From the monorepo root, `bun run dev:web`
starts both Vite servers and proxies `/app/` through the website on port 3000.
Start the website alone with `bun run --filter @sapo/web dev` only when the app
is already running or not needed.

The website build also builds the translator using Nitro’s Vercel preset and
merges its static files and server function into `.vercel/output`. Keep the Vercel
Root Directory at `apps/web` and enable access to files outside the root directory
(the workspace dependencies and sibling app are build inputs). Public app variables
`VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` must be set in the same Vercel project
at build time. The site’s private Turso variables keep their current behavior.
