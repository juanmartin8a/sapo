# Monorepo migration

The monorepo uses Bun workspaces with mobile at `apps/mobile`, the SvelteKit
website at `apps/web`, and the Convex project at `packages/backend`.

## History and source preservation

The mobile directory move is followed by a merge whose additional parents are
the existing backend and website HEAD commits. No source history is rewritten
or squashed. Source identities are recorded in the root README. The existing
Convex checkout's HEAD is imported, including the commit newer than the old
mobile submodule pointer.

Backend files and generated bindings are imported intact; only backend workflow
documentation changes. Website source and configuration are imported intact;
its package gets a unique workspace name and a typecheck alias. Mobile code
changes replace backend-relative aliases with explicit package imports.

The shared lockfile retains the original direct dependency versions from both
applications. The isolated linker requires explicit declarations for mobile's
Babel runtime, Jest globals, Node types, and test renderer. Backend tests now
run independently in Jest's Node environment. Mobile's Expo Jest allowlist also
recognizes Bun's `.bun` dependency directory.

Mobile TypeScript explicitly loads `expo/types` so verification works in a fresh
checkout before Expo generates the ignored `expo-env.d.ts`. CocoaPods regenerates
native dependency paths for the workspace install, retaining pod versions.

## Verification

- Original baseline: 492 mobile/backend tests and 21 website tests pass.
- Migrated workspace: 98 mobile, 394 backend, and 21 website tests pass (513 total).
- All workspace type checks and linters pass.
- Prompt freshness check passes; generated Convex bindings remain unchanged.
- Convex code generation dry run successfully resolves and bundles components.
- Website production build succeeds with the existing Vercel adapter.
- Metro production exports succeed for iOS and Android.
- CocoaPods installs successfully with 125 pods.
- Android Gradle configuration succeeds (`:app:tasks`) with native OpenJDK 17.
  The machine's default Java executable is an incompatible Intel JDK 15.
- A full iOS simulator build is blocked by existing RevenueCat 5.59.2 initializer
  conflicts under Xcode 27. The original checkout also fails on the same
  initializer conflicts, and its RevenueCat source is identical. This migration
  does not change that dependency. Android APK compilation was not performed.

The website's build retains its baseline warnings for optional WebSocket native
accelerators. The backend linter also emits a React auto-detection warning because
its Expo lint preset is shared with the previous setup and React is not a backend
runtime dependency.

## Rollout

Development environment files are ignored and remain workspace-local. Use the
existing Convex deployment selector and keep secrets in their existing services.
Before the first monorepo deployment, change Vercel's repository/root directory
to this repository and `apps/web`, and any EAS GitHub app base directory to
`apps/mobile`. The existing deployment identities, databases, and domain remain
applicable. Remote hosting configuration and repositories have not been changed.

## Review in the permanent checkout

The standalone repository is at `~/development/js/sapo`, on
`codex/sapo-monorepo`. Its `.git` directory and objects are independent of the
original repositories and the temporary migration worktree. The Git origin
continues to point to the original SAPO GitHub repository; nothing has been pushed.

A fresh frozen-lockfile install and the workspace checks were repeated there
with Node.js 24.21.0 and Bun 1.4.0. All 513 tests, type checks, linters, prompt
freshness checks, the website production build, iOS/Android Metro exports, and
Android Gradle configuration pass. Every original source file was accounted for;
all 460 original commits and the original direct dependency versions were checked.
Backend implementations and generated bindings remain byte-for-byte identical.

Moving the repository changes Hermes's generated `HERMES_CLI_PATH` in its podspec.
CocoaPods therefore regenerated only the Hermes podspec checksum in `Podfile.lock`
for the final location. Pod versions did not change. A subsequent
`pod install --deployment` passes there. A new location may require a normal
`pod install` before using deployment mode because of this upstream absolute path.

The pre-existing local changes in `apps/mobile/app.json` and
`apps/mobile/ios/SAPO/Info.plist` remain staged and outside the migration commits.
The original mobile, backend, and website working directories are unchanged.
The full iOS compiler issue and remote deployment rollout requirements above
remain applicable; this review does not claim a successful full native build.
