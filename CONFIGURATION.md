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
