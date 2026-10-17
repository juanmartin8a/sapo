# AGENTS.md

## Project shape

- Bun workspace monorepo: `apps/mobile` (Expo + React Native), `apps/web`
  (SvelteKit + Turso), `apps/translator` (TanStack Start + Solid 2 at `/app`),
  `packages/client-core` (pure shared client code), and `packages/backend` (Convex).
- Keep mobile `app/` limited to routes and layouts; screens and UI belong in
  `components/`. Stores, hooks, providers, and integrations retain their own dirs.
- Convex is ordinary tracked source under `packages/backend/convex`, not a Git
  submodule. Its Better Auth, operations, subscriptions, and Resend components
  retain their existing boundaries.
- Mobile imports `@sapo/backend/api` and `@sapo/backend/constants/*`; do not add
  client imports of backend implementations. The SvelteKit site uses Turso; the translator uses the same Convex deployment as mobile.
- Mobile and translator share pure constants and streaming through `@sapo/client-core`.
  Do not import React, Expo, or native modules into the translator.
- Keep UI, framework configuration, and dependencies local to their workspaces.

## Commands

- Use Node.js 24 and Bun 1.4.0. Install from the repo root with
  `bun install --frozen-lockfile`. Keep one root `bun.lock`; do not introduce npm
  or per-workspace lockfiles.
- Development: `bun run dev:mobile`, `bun run dev:web`, `bun run dev:backend`.
  `dev:web` starts the site on 3000 and translator on 3001, proxied at `/app/`.
- Native: `bun run ios`, `bun run android`. EAS CLI runs from `apps/mobile`.
- Verification: `bun run typecheck`, `bun run lint`, `bun run test`,
  `bun run prompts:check`, `bun run build:web`.
- Individual commands: `bun run --filter @sapo/mobile test`,
  `bun run --filter @sapo/backend test`, `bun run --filter @sapo/web check`.
- Jest is one-shot by default. Use workspace `test:watch` only intentionally.
- Mobile lint explicitly covers routes, components, hooks, stores, integrations,
  providers, utilities, constants, and types. Backend lint runs independently.
- Convex dev/codegen/deploy: `bun run convex:dev`, `bun run convex:codegen`,
  `bun run convex:deploy`.

## Generated files

- Do not hand-edit `packages/backend/convex/**/_generated/`. Regenerate using the
  backend workspace's Convex CLI and preserve committed output.
- Edit `packages/backend/convex/prompts/*.md`, run `bun run prompts:generate`,
  and commit the generated prompt bundle with the Markdown.
- Do not hand-edit `apps/mobile/expo-env.d.ts`; Expo owns it.
- Mobile SVG imports are React components through the existing Metro transformer.

## Environment and deployment

- Keep private env files in the owning workspace. Mobile uses
  `EXPO_PUBLIC_CONVEX_URL` and `EXPO_PUBLIC_CONVEX_SITE_URL`; RevenueCat client
  config remains optional and platform-specific.
- Backend `.env.local` selects the existing Convex deployment with
  `CONVEX_DEPLOYMENT`; server secrets remain in Convex's deployment environment.
- Never expose server secrets with an `EXPO_PUBLIC_` prefix.
- Website Turso credentials are private server settings; see its `.env.example`.
- EAS config and native projects live in `apps/mobile`. Vercel Root Directory is
  `apps/web`; its build merges the translator Vercel output into the same website
  deployment. Preserve the Turso database and shared mobile/translator Convex identity.
- Translator public env lives in `apps/translator/.env.local`. Use only `VITE_CONVEX_URL`
  and `VITE_CONVEX_SITE_URL` for public deployment URLs; Stripe secrets are server-only.
