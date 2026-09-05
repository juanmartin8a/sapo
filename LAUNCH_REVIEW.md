# SAPO launch review — 2026-09-04

The local verification is clean after the fixes below. This is a code review and build verification, not a production launch certification. Review emphasis was authentication, cloud streaming, quota accounting, subscription reconciliation and deletion, local model lifecycle, client state, database access patterns, and native/build configuration. No production load test, signed native build, store transaction, or live OAuth/deletion flow was performed.

## Changes made

| Issue | Change | Regression coverage |
| --- | --- | --- |
| JSON-shaped user text could bypass input limits and undercount monthly usage. Request preparation extracted the user text, then quota accounting parsed it again and counted an inner `input` field. | Count every Unicode code point in the already extracted text. Language/transport metadata stays excluded. | A nested JSON input exceeding 10,000 characters reaches the quota mutation with its full length; Unicode and empty inner values are covered. |
| Cloud streams ending without a completion marker appeared successful. | Treat unexpected EOF as a protocol error in SSE and line-delimited responses, including the buffered fallback. | Truncated responses in both formats and both reader modes. |
| Translation text matching a legacy control marker could prematurely terminate output. Readers were also left locked after an early terminal event. | Explicit translation token events remain text; terminal events retain control semantics. Cancel and release stream readers in cleanup. Flush the UTF-8 decoder at EOF. | Literal marker-shaped tokens, completion, reader cleanup, existing cancellation and timeout tests. |
| Sign-out HTTP errors returned as `{ error }` were treated as success. | Share a checked sign-out helper between settings and the unsupported-session gate. Existing error handling now receives these failures. | Returned HTTP errors, transport exceptions, and successful sign-out. |
| Monthly character quotas did not bound bursts of tiny or repeatedly failing requests. | Enforce three processing requests and 30 starts per rolling minute per account, shared across cloud operations. Check inside the reservation mutation before quota preparation/insertion. Reads are bounded at three active and 30 recent records using existing indexes. | Concurrent limit, rolling-window boundary, failed attempts, user isolation, reservation rejection, and client error messaging. |
| Restoration fallback queries collected quota periods belonging to unrelated subscriptions with the same start time. | Add `by_store_subscription_id_and_period_start_at_ms` and use a shared document lookup. Existing store, status, ownership, and period-end checks remain. | Subscription/window isolation plus the existing subscription and deletion tests. |

The reservation watchdog remains responsible for releasing abandoned processing requests. A request limit can therefore temporarily block an account after a server interruption until that existing recovery runs. No new infrastructure or paid service was added.

## Verification

- `npm exec tsc -- --noEmit`: passed.
- `npm run lint -- app components convex stores hooks lib providers utils constants types`: passed.
- `npm exec jest -- --watchAll=false --runInBand`: 39 suites, 290 tests passed (baseline: 36 suites, 273 tests).
- `npm exec expo export -- --platform all --output-dir /tmp/sapo-launch-review-export`: passed for iOS, Android, and web, including 14 static routes.
- `git diff --check` in the app and Convex repositories: passed.

An earlier export overlapped file creation and failed to resolve the new helper; the final export above ran after source changes and passed. Native outputs are JavaScript/Hermes bundles, not signed application binaries. Web output includes a 4.5 MB uncompressed JavaScript bundle; export success does not establish browser startup performance.

## Deployment and remaining validation

The backend is a separate Git submodule. Record its changes in that repository and update the app's submodule reference as part of release. The submodule already differed from the parent reference at review start; that existing state was preserved. Generated API output also reflects the new backend module; generated files were not hand-edited.

Deploy the schema/index and backend changes together through the normal Convex release workflow. Production deployment and index availability were not verified here. The client and backend changes should ship together so temporary rate-limit responses use the new message.

| Priority | Remaining work | Evidence / reason |
| --- | --- | --- |
| Before launch | Validate the deployed OpenAI prompt IDs/versions, model, output-token limits, and response-storage settings. | `convex/model/sapopinguino/openAiResponses.ts` uses remotely configured prompts; their contents are absent from this repository. Request timeouts and input quotas do not establish a dollar ceiling. No model or output cap was guessed during this review. |
| Before launch | Exercise Apple/Google sign-in, purchase/restore/renewal/refund/transfer, account switching, and deletion on signed builds against the release environment. Verify email templates, callback URLs, webhook authentication, and alert delivery. | Unit tests mock external systems. Signing, store products, backend environment values, and dashboard configuration were not validated. The checked-in Android Gradle release block references debug signing; verify the actual production build credentials rather than relying on a local release APK. |
| Before broad rollout | Measure load, database reads, request latency, and provider cost with representative text and failure scenarios. | New per-account limits constrain bursts, not aggregate traffic across accounts. Production capacity and cost per active user were not measured. |
| At scale | Size recovery/retention throughput against event volume and monitor oldest queued work. | Default expiry reconciliation selects 10 accounts every five minutes (120 selections/hour via that cron). Terminal RevenueCat retention deletes at most 500 events per terminal status per daily run. Webhooks and on-demand refresh provide additional paths, but a large backlog can outgrow these maintenance rates. |
| At scale | Define usage-event and historical quota retention before introducing automated deletion. | Normal usage creates retained `usage_events`; current deletion is account-driven. Historical user quota records are also read by some reconciliation paths. An arbitrary purge could weaken request deduplication or quota restoration, so retention semantics need explicit design. |
| Device validation | Test local model download/cancel/restart, offline reuse, repeated generation, memory pressure, backgrounding, and low storage on the lowest supported devices. | Pinned model files are approximately 2.59 GB and 3.66 GB. Current integrity checks use response metadata, size, and modification time rather than hashing downloaded bytes. Native memory safety and download integrity were not proven by mocked lifecycle tests. |

The existing design already provides useful safeguards: authenticated cloud endpoints, bounded incoming request bodies, server-owned subscription decisions, transactional quota reservations, delayed reservation recovery, reconciliation leases, deletion recovery, and batched client token updates. Those were preserved. Remaining items above are concrete limits of this review and release checks, not claims that those external systems are currently failing.
