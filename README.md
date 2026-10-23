# SAPO monorepo

SAPO's mobile app, website, and Convex backend live in one Git repository.

## Workspaces

| Workspace | Directory | Purpose |
| --- | --- | --- |
| `@sapo/mobile` | `apps/mobile` | Expo + React Native app, native projects, and EAS configuration |
| `@sapo/web` | `apps/web` | TanStack Start + Solid 2 website, translator at `/`, and server-side Turso reader |
| `@sapo/client-core` | `packages/client-core` | Pure shared streaming transport and client constants |
| `@sapo/backend` | `packages/backend` | Convex functions, components, generated bindings, and prompt generation |

The website uses Turso for the pronunciation database. The translator shares mobile accounts,
subscription access, quotas, and the existing Convex deployment. Each workspace owns
its dependencies, environment files, checks, and deployment configuration.

## Development

Use Node.js 24 (`.nvmrc`) and Bun 1.4.0 (`packageManager`). Install from this root;
commit only the root `bun.lock`. Bun uses isolated installs so the apps can keep
separate tooling versions and native modules resolve from the mobile workspace.

```sh
nvm use
bun install --frozen-lockfile
bun run dev:mobile
bun run dev:web
bun run dev:backend
```

Run those development commands in separate terminals. `dev:web` starts the unified
website at `http://127.0.0.1:3000/`, including the translator at `/`.
`dev:app` and `web` are aliases for the same web server. `start`, `ios`, and
`android` target mobile; use `bun run --filter @sapo/mobile web` for Expo's web target.

Private environment files belong in their workspace, never in Git:

- `apps/mobile/.env.local`: existing `EXPO_PUBLIC_*` client configuration.
- `packages/backend/.env.local`: `CONVEX_DEPLOYMENT` for the existing development
  deployment (or the appropriate Convex CLI credentials in CI). Server secrets
  remain in the Convex dashboard, separately for each deployment.
- `apps/web/.env.local`: private Turso settings, public Convex deployment URLs
  matching mobile, and optional server-only Stripe settings; see `apps/web/.env.example`.

Keep the existing Convex deployment identity when starting the backend. Moving
source directories does not require creating a new Convex project or database.

## Verification

```sh
bun run typecheck
bun run lint
bun run test
bun run prompts:check
bun run build:web
```

Run individual workspace commands with `bun run --filter @sapo/mobile test`,
`bun run --filter @sapo/backend test`, or `bun run --filter @sapo/web check`.
Tests are one-shot by default; mobile and backend also provide `test:watch`.

Mobile imports backend API bindings through `@sapo/backend/api` and public
constants through `@sapo/backend/constants/*`. Never import backend action or
authentication implementations into a client bundle. Generated Convex files
remain committed and must be regenerated with the Convex CLI, not edited manually.

## Prompts and backend

Edit Markdown in `packages/backend/convex/prompts`, then run
`bun run prompts:generate`. Commit the Markdown and its generated bundle together.
`bun run convex:dev` and `bun run convex:deploy` generate prompts automatically.
`bun run convex:codegen` runs code generation from the backend workspace.

See [backend configuration](packages/backend/convex/CONFIGURATION.md) and
[prompt configuration](packages/backend/convex/prompts/README.md).

## Deployment

- **Mobile / EAS:** run EAS CLI commands from `apps/mobile`; `app.json`, `eas.json`,
  `ios/`, and `android/` stay together there. Install CocoaPods dependencies from
  `apps/mobile/ios` after the first workspace install before opening Xcode.
  If using Expo's GitHub integration, set its app base directory to `apps/mobile`.
- **Website / Vercel:** connect this repository and set Root Directory to
  `apps/web`. Use `bun run build` for the build command and
  `bun install --frozen-lockfile` for installation. Permit workspace source files
  outside the root directory. Keep the current domain, Node.js 24 runtime, and
  private Turso environment settings.
- **Convex:** deploy with `bun run convex:deploy` from the repository root. Retain
  the current deployment credentials and server environment values.

Each service deploys independently. Remote deployment settings are not changed
by this local migration.

## Preserved Git history

The migration imports the original histories as merge parents, without rewriting
commits or changing their authors, dates, messages, or hashes:

| Source | Original HEAD |
| --- | --- |
| Mobile | `f6353d39657e93b36d771e5be0d150bc11635367` |
| Convex | `2c2110d8c3b300d3f8a702b96f63685273dd68a2` |
| Website | `cad4c62363e9232a9fc92d09191082c2d0c202f6` |

Older commits show their original layouts. `git log --all --graph` shows the
combined histories; use `git log -m --follow -- <path>` when tracing a moved file.
The `-m` option compares merges with each parent so Git can follow backend and
website files across their import into the monorepo.
Convex is now ordinary tracked source, with its original license retained in
`packages/backend/convex/LICENSE`; no submodule initialization is needed.

## Web application

`bun run build:web` builds the unified TanStack Start + Solid 2 website into
`apps/web/.vercel/output`. Keep the Vercel Root Directory at `apps/web` and use
Framework Preset **Other**. Public pages are prerendered; database endpoints and
`/` run on the server. The PWA stays scoped to `/pwa/`.
See [web setup](apps/web/README.md) for origins, callbacks, shared access rules,
and the disabled Stripe foundation. `bun run --filter @sapo/web verify:build`
checks the deployment artifact and preserved page copy after building.
