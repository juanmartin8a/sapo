# Backend configuration

Use environment variables for secrets, deployment identity, and a small set of
operational overrides. Keep product rules, retry policies, retention, safety
limits, and coordinated workflow timings in code. Add overrides only for a
concrete operational need; do not move every constant into a shared file.

## Optional operational overrides

| Variable | Default | Allowed values | Purpose |
| --- | --- | --- | --- |
| `REVENUECAT_ON_DEMAND_SYNC_AFTER_MS` | 28800000 (8 hours) | Integers 0–86400000 | Subscription cache freshness; zero always requests fresh state. Access expiration is checked separately. This is not a scheduled refresh interval. |
| `REVENUECAT_WEBHOOK_RETRY_BATCH_LIMIT` | 20 | Integers 1–100 | Maximum webhook events processed per retry worker run. Does not control user deletion. |
| `REVENUECAT_RECONCILIATION_BATCH_LIMIT` | 10 | Integers 1–50 | Maximum due subscription states selected per reconciliation run. |
| `EMAIL_TEST_MODE` | false | `true` or `false` | Explicitly enable Resend test mode for development. Omission preserves live sending. |

Defaults apply when variables are absent. Invalid supplied values throw a named
configuration error; they are not silently clamped or replaced. The one-day
freshness ceiling bounds staleness; batch ceilings preserve the previous limits.
Webhook retries and expiration reconciliation run every five minutes in
`crons.ts`. Delay constants determine retry eligibility, not exact execution time.

Keep existing API keys, auth secrets, OAuth identifiers, provider project/account
identifiers, `CLIENT_ORIGIN`, `DELETE_ACCOUNT_CALLBACK_URL`, `CONVEX_SITE_URL`,
and `OPERATIONAL_ALERT_EMAIL` in deployment configuration. No changes to those
settings are required by this cleanup.

## Integration contracts

Reviewed against official documentation on 2026-09-06. This is a source and local
test review; provider dashboard settings and live delivery were not verified.

### Resend

The [official Convex component](https://github.com/get-convex/resend) owns email
queueing, delivery retries, webhook signature verification, and delivery status.
`model/email.ts` passes the Convex action context directly to the component.
The daily cleanup job retains finalized emails for one week and abandoned emails
for four weeks.

Configure `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` in Convex. Register
`https://<deployment>.convex.site/webhooks/resend` for Resend's `email.*` events.
The sender domain `sapo.surf` must be verified and the published
`verify_account_deletion` template must accept the `URL` variable. Test mode is
controlled by `EMAIL_TEST_MODE` above.

### RevenueCat

The [v2 API](https://www.revenuecat.com/docs/api-v2) uses server-side v2 secret
keys with Bearer authorization. `REVENUECAT_PROJECT_ID` identifies the project.
`REVENUECAT_POLYGLOT_ENTITLEMENT_ID` must be the resource ID (`entl...`), while
the client's `EXPO_PUBLIC_REVENUE_CAT_ENTITLEMENT_ID` is its lookup key.

`REVENUECAT_CI_SUBSCRIPTIONS_R_API_KEY` needs **both**
`customer_information:subscriptions:read` and
`customer_information:customers:read`: reconciliation reads subscriptions and
[active entitlements](https://www.revenuecat.com/docs/api-v2/customer/resources).
Do not infer its permissions from the environment variable name. Customer
deletion uses the separate `REVENUECAT_CI_CUSTOMERS_RW_API_KEY`.

Register `https://<deployment>.convex.site/webhooks/revenuecat` with the
authorization value configured in `REVENUECAT_WEBHOOK_AUTH_SECRET`. The handler
persists events, schedules processing, and returns HTTP 200; duplicate events,
aliases, transfers, and retries are handled by the subscription component.
Choose the intended app and sandbox/production filters in the
[webhook dashboard](https://www.revenuecat.com/docs/integrations/webhooks).

The client selects packages from the customer's
[current offering](https://www.revenuecat.com/docs/getting-started/displaying-products)
to preserve targeting and purchase attribution. If it has no packages, the
existing explicitly configured store-product fallback remains available.
Malformed entitlement expirations are rejected; only an explicit `null`
represents no expiration.

### Better Auth, Apple/Google, and Cloudflare

The [Convex Expo guide](https://labs.convex.dev/better-auth/framework-guides/expo)
requires separate native Expo and web cross-domain client plugins; the app
already selects them by platform and registers auth routes with CORS enabled.
OAuth callbacks use the Convex site URL. Apple configuration distinguishes
the web Service ID from the native bundle ID, following
[Better Auth's Apple guide](https://better-auth.com/docs/authentication/apple).
Native sign-in exchanges authorization codes for revocable tokens; account
deletion uses [Apple's revocation endpoint](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens).

Cloudflare endpoint, authentication, model, and streaming configuration is
documented with official sources in [the AI setup guide](prompts/README.md).
Live OAuth callbacks, store purchases/restores, email delivery, and AI model
access still need provider-backed smoke tests; mocked tests cannot confirm
those dashboard settings.

## Removed overrides

Deploy the updated backend before removing the following dashboard variables.
The code now uses the values below regardless of obsolete dashboard overrides;
review any existing custom values before deploying.

| Remove | Code value |
| --- | --- |
| `REVENUECAT_WEBHOOK_MAX_RETRY_COUNT` | 12 |
| `REVENUECAT_WEBHOOK_RETRY_BASE_DELAY_MS` | 15000 (15 seconds) |
| `REVENUECAT_WEBHOOK_MAX_RETRY_DELAY_MS` | 21600000 (6 hours) |
| `REVENUECAT_RECONCILIATION_FAILURE_BACKOFF_MS` | 1800000 (30 minutes) |
| `FROZEN_QUOTA_PERIOD_RETENTION_MS` | 5184000000 (60 days) |
| `REVENUECAT_EVENTS_RETENTION_MS` | 7776000000 (90 days) |
| `OPERATIONAL_ALERTS_RESOLVED_RETENTION_MS` | 7776000000 (90 days) |
| `APP_NAME` | SAPO |

Subscription/RevenueCat policies live in `constants/subscriptions.ts` and
`constants/revenueCat.ts`. Alert retention lives in
`constants/operationalAlerts.ts`, and app identity in `constants/app.ts`.
Deletion workers have a fixed default batch size of 20, independent of webhooks;
explicit cleanup recovery limits retain their existing 1–25 clamp.
