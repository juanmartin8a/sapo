# Dependency compatibility

The November 2026 dependency refresh updates every workspace and the root lockfile.
Some packages deliberately remain below their registry's `latest` tag:

| Group | Constraint |
| --- | --- |
| Expo native dependencies, React, and React Test Renderer | Follow Expo 58.0.24's `bundledNativeModules.json`; keep React and its renderer at the same version. Use `bunx expo install --check` from `apps/mobile` to verify. |
| RevenueCat | Keep the latest 10.x release (10.16.0). The [v11 release notes](https://github.com/RevenueCat/react-native-purchases/releases/tag/11.0.0) still direct Expo apps to stay on 10.x. |
| Babel | Keep the latest 7.x releases. Expo and React Native's presets depend on Babel 7; the backend's Jest runtime also fails to load Babel 8's ESM dependencies. |
| TypeScript | Keep 6.0.3; typescript-eslint 8.72.2 requires `<6.1.0`. |
| ESLint | Mobile and backend use 9.39.5 because Expo's React lint plugin does not support ESLint 10. Web uses 10.14.0. |
| Node types | Use the latest Node 24 types, matching `.nvmrc`, the workspace engines, and Vercel's runtime. |
| Solid/TanStack | Continue the existing Solid 2 release candidate line: Solid/compiler RC 21, Start/Router RC 10, Vite plugin next.57. Their registry `latest` tags can point to the Solid 1 line. |
| TanStack Start cores | Server 1.169.40 is the newest release exposing the request/response APIs Solid Start RC 10 imports. Keep its client 1.170.35 and storage 1.167.37 dependencies together: newer clients change server-function error handling. The tracked Router patch remains necessary and applies to RC 10. |

The Better Auth upgrade to 1.7.21 and Convex adapter 0.13.0 includes the local
component's `consumeOne` and `incrementOne` exports, regenerated schema and Convex
bindings, and explicit provisioning metadata for the operator-only demo user.
The schema adds optional JWKS fields and account/rate-limit indexes; it does not
replace the existing users or sessions. Follow the [adapter upgrade guide](https://labs.convex.dev/better-auth/upgrading/from-0-12)
when deploying the backend and clients together. This refresh does not deploy them.

After installing, rebuild native development clients: LiteRT-LM 0.8.2 requires
Nitro Modules 0.37.x and a matching iOS pod installation. Preserve the existing
Kotlin 2.3.0 configuration and model verification behavior.
Use Xcode's Clean Build Folder or a fresh derived-data directory after the
LiteRT/Nitro upgrade; cached Swift/C++ modules can retain the old LiteRT C API.

`bun audit` still reports upstream transitive advisories for
[deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) (low),
[glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) (moderate), and
[minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249) (moderate).
Deepmerge's latest published release is affected; the affected glob/minimatch
copies are constrained to older majors by their parent packages. The refresh
keeps those declared ranges rather than forcing incompatible major overrides.
