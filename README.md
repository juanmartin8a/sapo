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

Do not expose either variable through public environment configuration. Remove the
old `PUBLIC_CONVEX_URL`; Convex is no longer a website dependency.

The pages remain prerendered. The pronunciation browser calls the same-origin
`/api/languages/` and `/api/pronunciations/?source=en&target=es` endpoints, which
query Turso on the server through `@libsql/client/http`. Pronunciations use a fixed
50-row page and a pair-bound `cursor` returned as `nextCursor` (null on the last
page). Pagination seeks by `(created_at, id)` using the existing pair index instead
of scanning an offset or counting all rows. It is a live view: later inserts can
appear on subsequent pages; it is not a database snapshot.

Successful API responses cache in the browser for 60 seconds and in shared caches
for 5 minutes (pronunciations) or 1 hour (languages), with 60 seconds of stale
revalidation. Errors are not cached and never expose upstream SDK messages.
Database HTTP requests time out after 8 seconds and reject redirects.

Once you've installed dependencies, start a development server:

```sh
bun run dev

# or start the server and open the app in a new browser tab
bun run dev --open
```

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
