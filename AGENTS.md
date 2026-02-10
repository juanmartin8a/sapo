# AGENTS.md

Guidance for coding agents working in this repository.

## 1) Project snapshot

- Stack: Expo + React Native + TypeScript + Expo Router.
- State: Zustand stores in `stores/`.
- Backend/auth: Convex + Better Auth in `convex/` and `clients/auth-client.ts`.
- Linting: ESLint via `eslint-config-expo` (`eslint.config.js`).
- TypeScript: strict mode (`"strict": true`) is enabled.
- Package manager: `npm` is the default in docs (a `bun.lock` is also present).

## 2) Rule files (Cursor/Copilot)

Checked rule locations:

- `.cursor/rules/`: not present.
- `.cursorrules`: not present.
- `.github/copilot-instructions.md`: not present.

If these files are added later, treat them as higher-priority instructions.

## 3) Install / run / build commands

Run from repo root: `/Users/juanma/development/react-native/SAPO`.

### Dependencies

- `npm install`

### Runtime

- `npm run start` - start Expo dev server.
- `npm run ios` - run iOS app locally.
- `npm run android` - run Android app locally.
- `npm run web` - run web target.

### Lint

- `npm run lint` - run ESLint (Expo config).

### Tests (Jest + jest-expo)

- `npm test` - runs `jest --watchAll` (watch mode).
- `npx jest --watchAll=false` - run tests once.
- `npx jest path/to/file.test.ts --watchAll=false` - run one test file.
- `npx jest -t "test name" --watchAll=false` - run tests by name.
- `npx jest path/to/file.test.ts -t "test name" --watchAll=false` - one file + one test.

Notes:

- No committed `*.test.*` / `*.spec.*` files exist right now.
- Prefer colocated tests or a nearby `__tests__/` folder when adding tests.

### Type-check

- No dedicated `typecheck` script exists.
- Use `npx tsc --noEmit` before larger refactors.

### Convex workflows

- `npx convex dev` - run Convex locally and regenerate generated files.
- Generated files in Convex include this regeneration hint.

## 4) Code style and architecture guidelines

### 4.1 Imports

- Prefer alias imports using `@/` for app code.
- Group third-party imports before local imports.
- Use relative imports mostly for nearby siblings.
- Import SVGs as components (`metro.config.js` is configured for this).

### 4.2 Formatting

- Follow style already present in the file you edit.
- Avoid mass reformatting unrelated files.
- Keep JSX props multiline when readability improves.
- Keep object/style literals compact but readable.

### 4.3 TypeScript and types

- Preserve strict typing; do not introduce `any` unless unavoidable.
- Use explicit interfaces/types for props, store state, and action signatures.
- Prefer union types for finite UI states (used in stores today).
- Narrow nullable values before use (`session?.user`, guards, early returns).
- Use casts (`as`) only where integration APIs require them.

### 4.4 Naming conventions

- Components/files: PascalCase (e.g., `Settings.tsx`).
- Hooks/stores: camelCase with `use` prefix (e.g., `useTranslModeStore`).
- Props interfaces: `SomethingProps`.
- Event handlers: `handleX`.
- Constants: UPPER_SNAKE only for true constants; otherwise camelCase.

### 4.5 React / Expo patterns

- Use functional components.
- Prefer early-return guards in effects and async handlers.
- Use Expo Router navigation (`router.push`, `router.back`).
- Respect safe areas in screen-level components (`useSafeAreaInsets`).
- Keep gesture/animation logic in worklets where required.

### 4.6 Zustand patterns

- Define typed interfaces for state and actions.
- Keep updates immutable and explicit.
- Use selectors (`store((s) => s.x)`) to reduce re-renders.
- Use `getState()` for imperative cross-store/event flows when needed.

### 4.7 Error handling and logging

- Wrap async user actions in `try/catch`.
- Show user-facing failures with friendly messages (`Alert.alert`).
- Do not silently swallow errors.
- Keep `console.warn`/`console.error` sparse and actionable.
- Reset loading flags in `finally` when relevant.

### 4.8 Comments

- Add comments only for non-obvious logic.
- Keep comments short and accurate.
- Remove stale commented-out code unless intentionally kept.

### 4.9 Generated/sensitive files

- Do not hand-edit generated files:
  - `convex/_generated/`
  - `convex/betterAuth/_generated/`
  - `expo-env.d.ts`
- Regenerate generated artifacts through tooling (`npx convex dev`, Expo tools).
- Never commit secrets from `.env` or local env files.

## 5) Practical agent workflow

- Read nearby files first to match local conventions.
- Keep changes minimal and scoped to the request.
- Prefer root-cause fixes over superficial patches.
- Run lint and relevant tests when feasible.
- In your final response, include:
  - what changed,
  - commands run,
  - and any gaps (tests not run, missing env values, etc.).
