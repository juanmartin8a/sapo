# AGENTS.md

Compact guidance for future OpenCode sessions in this repo.

## Project Shape

- Expo + React Native + TypeScript app using Expo Router (`package.json` `main` is `expo-router/entry`). Routes live in `app/`; reusable UI lives mostly in `components/`.
- `app/_layout.tsx` wires the global providers: Convex, Better Auth, auth gating, RevenueCat identity sync, and keyboard handling.
- App state is in Zustand stores under `stores/`; Convex/Better Auth client code is in `clients/`.
- `convex/` is both backend code and a configured git submodule (`.gitmodules`); edits there are in the nested repo and root git status only shows the submodule pointer. If it is missing after clone, run `git submodule update --init --recursive`.
- Convex is componentized: root `convex/convex.config.ts` uses `betterAuth`, `sapopinguino`, `subscriptions`, and `@convex-dev/resend` components.

## Commands

- Use npm scripts from repo root. The repo has `bun.lock` but no `package-lock.json`; avoid introducing a new lockfile unless requested.
- Install: `npm install`
- Start Expo: `npm run start`
- Native runs: `npm run ios`, `npm run android`
- Web: `npm run web`
- Lint default Expo paths: `npm run lint`
- Lint non-default dirs when touched: `npm run lint -- convex stores clients utils constants types`
- Run all tests once: `npm exec jest -- --watchAll=false`
- Run one test file: `npm exec jest -- convex/__tests__/sapopinguinoInput.test.ts --watchAll=false`
- Type-check: `npm exec tsc -- --noEmit` (there is no `typecheck` script).
- Convex dev/codegen: `npm exec convex dev`

## Verification Notes

- `npm test` runs Jest in watch mode (`jest --watchAll`); do not use it for one-shot verification.
- Jest uses the `jest-expo` preset from `package.json`. Current tests are under `convex/**/__tests__/`.
- `expo lint` only targets Expo’s default directories unless paths are supplied; include backend/store/client dirs explicitly when changes are outside `app/` or `components/`.

## Generated And Integration Files

- Do not hand-edit Convex generated output: `convex/_generated/`, `convex/betterAuth/_generated/`, `convex/sapopinguino/_generated/`, or `convex/subscriptions/_generated/`. Regenerate with `npm exec convex dev`.
- Do not hand-edit `expo-env.d.ts`; Expo owns it.
- SVGs are imported as React components; `metro.config.js` removes `svg` from asset extensions and uses `react-native-svg-transformer/expo`.
- Metro has `resolver.unstable_enablePackageExports = true`; avoid removing it while debugging package resolution.

## Environment Gotchas

- Client startup requires `EXPO_PUBLIC_CONVEX_URL`; auth and SSE/refresh calls use `EXPO_PUBLIC_CONVEX_SITE_URL`.
- RevenueCat client config is optional but platform-specific: `EXPO_PUBLIC_REVENUE_CAT_APPLE_API_KEY`, `EXPO_PUBLIC_REVENUE_CAT_GOOGLE_API_KEY`, product IDs, and entitlement ID.
- Convex server env is separate from Expo public env; backend code reads OpenAI, Better Auth, Apple/Google auth, RevenueCat webhook/API, Resend, and `CLIENT_ORIGIN` values.
- Never expose server-only env values by adding an `EXPO_PUBLIC_` prefix.
