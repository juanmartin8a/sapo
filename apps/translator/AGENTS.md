# SAPO translator at /app

- This is a separate TanStack Start + Solid 2 client. Keep route modules thin; screens and UI belong in components/, state factories in stores/, lifecycle in providers/, integrations in lib/.
- Follow the mobile project's TypeScript naming, four-space indentation, double quotes, and feature boundaries. Share pure domain constants through @sapo/client-core and @sapo/backend; never import React, Expo, Zustand hooks, or native integrations.
- Use Solid 2 APIs: createStore from solid-js with draft setters, onSettled lifecycle, split createEffect, and JSX types from @solidjs/web. Create state per provider instance, never in mutable module singletons during SSR.
- No local AI, demo access, or checkout. Honor the same subscription access and quotas as mobile; Convex is authoritative. Stripe secrets remain server-only. Never infer paid access from local storage or a browser-supplied flag.
- The service worker must never cache auth, API responses, or user text. Persist preferences only, never input/output.
- From the monorepo root use bun run dev:web (website and app), bun run dev:app (app only), bun run build:web, and bun run --filter @sapo/translator typecheck/test. Install at the root; keep only the root bun.lock.

- Treat the native components as the visual source of truth. Do not add decorative outlined buttons, framed workspaces, or outlined account cards. Social sign-in uses the native gray Google / black Apple fills; translation is a plain arrow/stop icon in the header. Preserve native structural separators and visible keyboard focus.

- Keep router, public assets, OAuth callbacks, manifest, and service worker under /app/. The PWA must never control the marketing site. The website deployment merges this workspace’s Vercel output through scripts/build-app.mjs.
